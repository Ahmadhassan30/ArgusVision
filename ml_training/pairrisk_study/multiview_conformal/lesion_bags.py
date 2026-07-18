"""Build, validate, deduplicate, and split lesion-level prediction bags."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

from .constants import (
    CLASS_ORDER,
    DESIGN_FRACTION,
    PROBABILITY_COLUMNS,
    RANDOM_SEED,
    REQUIRED_COLUMNS,
)


@dataclass(frozen=True)
class DuplicateAudit:
    rows_before: int
    rows_after: int
    duplicate_normalized_ids_removed: int
    duplicate_file_hashes_removed: int
    file_hashes_attempted: int
    file_hashes_missing: int


def _forbid_final_test_text(value: object) -> None:
    text = str(value).lower()
    if "final_test" in text or "final-test" in text:
        raise RuntimeError("Protocol guard: final-test path or identifier detected.")


def load_predictions(path: str | Path) -> pd.DataFrame:
    path = Path(path)
    _forbid_final_test_text(path)
    if not path.exists():
        raise FileNotFoundError(path)
    if path.suffix.lower() == ".csv":
        frame = pd.read_csv(path)
    elif path.suffix.lower() in {".parquet", ".pq"}:
        frame = pd.read_parquet(path)
    else:
        raise ValueError(f"Unsupported prediction format: {path.suffix}")
    return validate_predictions(frame)


def validate_predictions(frame: pd.DataFrame) -> pd.DataFrame:
    missing = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing:
        raise ValueError(f"Prediction frame is missing required columns: {missing}")

    result = frame.copy()
    if result.empty:
        raise ValueError("Prediction frame is empty.")
    if result["lesion_group"].isna().any():
        raise ValueError("lesion_group contains missing values.")
    if result["label"].isna().any():
        raise ValueError("label contains missing values.")

    labels_per_lesion = result.groupby("lesion_group")["label"].nunique()
    bad = labels_per_lesion[labels_per_lesion != 1]
    if not bad.empty:
        raise ValueError(f"Lesions with inconsistent labels: {bad.index.tolist()[:10]}")

    probs = result.loc[:, PROBABILITY_COLUMNS].to_numpy(dtype=np.float64)
    if not np.isfinite(probs).all():
        raise ValueError("Ensemble probabilities contain NaN or infinity.")
    if (probs < -1e-9).any():
        raise ValueError("Ensemble probabilities contain negative values.")
    if not np.allclose(probs.sum(axis=1), 1.0, atol=1e-6, rtol=0.0):
        raise ValueError("Ensemble probability rows do not sum to one.")

    observed_labels = sorted(result["label"].astype(int).unique().tolist())
    if not set(observed_labels).issubset(set(range(len(CLASS_ORDER)))):
        raise ValueError(f"Unexpected label indices: {observed_labels}")

    return result


def _sha256(path: Path, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def collapse_exact_duplicates(
    frame: pd.DataFrame,
    *,
    image_root: str | Path | None = None,
) -> tuple[pd.DataFrame, DuplicateAudit, pd.DataFrame]:
    """Collapse exact duplicate images conservatively within lesion groups.

    The normalized image identifier is checked first. When files are locally
    available, SHA-256 is additionally used. Duplicate hashes spanning different
    lesion groups cause a hard failure because that indicates leakage or metadata
    corruption rather than a harmless repeated view.
    """
    result = validate_predictions(frame)
    rows_before = len(result)
    audit_rows: list[dict[str, object]] = []

    normalized_col = "_normalized_image_id" if "_normalized_image_id" in result.columns else "image"
    duplicate_mask = result.duplicated(["lesion_group", normalized_col], keep="first")
    duplicate_normalized_ids_removed = int(duplicate_mask.sum())
    if duplicate_normalized_ids_removed:
        for _, row in result.loc[duplicate_mask, ["lesion_group", "image", normalized_col]].iterrows():
            audit_rows.append(
                {
                    "duplicate_type": "normalized_image_id",
                    "lesion_group": row["lesion_group"],
                    "image": row["image"],
                    "value": row[normalized_col],
                }
            )
        result = result.loc[~duplicate_mask].copy()

    duplicate_file_hashes_removed = 0
    file_hashes_attempted = 0
    file_hashes_missing = 0

    if image_root is not None:
        root = Path(image_root)
        hashes: list[str | None] = []
        for _, row in result.iterrows():
            candidate = Path(str(row.get("image_path", "")))
            if not candidate.is_file():
                candidate = root / str(row["image"])
                if candidate.suffix == "":
                    for extension in (".jpg", ".jpeg", ".png"):
                        possible = candidate.with_suffix(extension)
                        if possible.is_file():
                            candidate = possible
                            break
            if candidate.is_file():
                file_hashes_attempted += 1
                hashes.append(_sha256(candidate))
            else:
                file_hashes_missing += 1
                hashes.append(None)
        result["_exact_file_sha256"] = hashes

        present = result[result["_exact_file_sha256"].notna()]
        cross_lesion = present.groupby("_exact_file_sha256")["lesion_group"].nunique()
        cross_lesion = cross_lesion[cross_lesion > 1]
        if not cross_lesion.empty:
            raise RuntimeError(
                "Identical image bytes occur across lesion groups; potential leakage detected."
            )

        hash_duplicate_mask = result["_exact_file_sha256"].notna() & result.duplicated(
            ["lesion_group", "_exact_file_sha256"], keep="first"
        )
        duplicate_file_hashes_removed = int(hash_duplicate_mask.sum())
        if duplicate_file_hashes_removed:
            for _, row in result.loc[
                hash_duplicate_mask, ["lesion_group", "image", "_exact_file_sha256"]
            ].iterrows():
                audit_rows.append(
                    {
                        "duplicate_type": "file_sha256",
                        "lesion_group": row["lesion_group"],
                        "image": row["image"],
                        "value": row["_exact_file_sha256"],
                    }
                )
            result = result.loc[~hash_duplicate_mask].copy()

    audit = DuplicateAudit(
        rows_before=rows_before,
        rows_after=len(result),
        duplicate_normalized_ids_removed=duplicate_normalized_ids_removed,
        duplicate_file_hashes_removed=duplicate_file_hashes_removed,
        file_hashes_attempted=file_hashes_attempted,
        file_hashes_missing=file_hashes_missing,
    )
    return result.reset_index(drop=True), audit, pd.DataFrame(audit_rows)


def view_bin(n_views: int) -> str:
    if n_views <= 0:
        raise ValueError("n_views must be positive.")
    if n_views == 1:
        return "1"
    if n_views == 2:
        return "2"
    return "3+"


def build_lesion_table(frame: pd.DataFrame) -> pd.DataFrame:
    validated = validate_predictions(frame)
    lesion = (
        validated.groupby("lesion_group", sort=True)
        .agg(
            lesion_id=("lesion_id", "first"),
            label=("label", "first"),
            label_name=("label_name", "first"),
            n_views=("image", "size"),
        )
        .reset_index()
    )
    lesion["label"] = lesion["label"].astype(int)
    lesion["view_bin"] = lesion["n_views"].map(view_bin)
    lesion["multi_view"] = lesion["n_views"] >= 2
    return lesion


def split_design_calibration(
    lesion_table: pd.DataFrame,
    *,
    design_fraction: float = DESIGN_FRACTION,
    seed: int = RANDOM_SEED,
) -> pd.DataFrame:
    if not 0 < design_fraction < 1:
        raise ValueError("design_fraction must be in (0,1).")
    required = {"lesion_group", "label_name", "view_bin"}
    if not required.issubset(lesion_table.columns):
        raise ValueError(f"Lesion table missing columns: {sorted(required - set(lesion_table.columns))}")

    table = lesion_table.copy()
    table["_stratum"] = table["label_name"].astype(str) + "|" + table["view_bin"].astype(str)
    counts = table["_stratum"].value_counts()
    if (counts < 2).any():
        # Deterministic fallback for extremely sparse class/view combinations.
        sparse = set(counts[counts < 2].index)
        table.loc[table["_stratum"].isin(sparse), "_stratum"] = table.loc[
            table["_stratum"].isin(sparse), "label_name"
        ].astype(str)

    # StratifiedShuffleSplit also requires each side of the split to contain at
    # least as many samples as there are strata. Small smoke tests or unusually
    # sparse cohorts may violate that even when every stratum has >=2 members.
    n_total = len(table)
    n_design = int(round(n_total * design_fraction))
    n_calibration = n_total - n_design
    n_strata = table["_stratum"].nunique()
    if min(n_design, n_calibration) < n_strata:
        table["_stratum"] = table["label_name"].astype(str)
        counts = table["_stratum"].value_counts()
        if (counts < 2).any() or min(n_design, n_calibration) < table["_stratum"].nunique():
            # Last-resort deterministic unstratified split. This branch is meant
            # for tiny tests; the real publication cohort uses full class/view
            # stratification and records the strategy in its output manifest.
            stratify = None
        else:
            stratify = table["_stratum"]
    else:
        stratify = table["_stratum"]

    design_ids, calibration_ids = train_test_split(
        table["lesion_group"],
        train_size=design_fraction,
        random_state=seed,
        shuffle=True,
        stratify=stratify,
    )
    design_set = set(design_ids)
    calibration_set = set(calibration_ids)
    if design_set & calibration_set:
        raise RuntimeError("Design/calibration overlap detected.")

    table["analysis_split"] = np.where(
        table["lesion_group"].isin(design_set), "risk_design", "risk_calibration"
    )
    return table.drop(columns="_stratum").sort_values("lesion_group").reset_index(drop=True)


def subset_rows(frame: pd.DataFrame, lesion_ids: Iterable[str]) -> pd.DataFrame:
    lesion_ids = set(lesion_ids)
    return frame[frame["lesion_group"].isin(lesion_ids)].copy()
