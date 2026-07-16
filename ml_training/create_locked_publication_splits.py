"""Create locked publication-safe Argus Vision split CSVs.

This script rebuilds the canonical ISIC dataframe and attaches official lesion
metadata. The publication experiment intentionally excludes rows without a
verified ``lesion_id``; it never synthesizes lesion IDs or falls back to an
image-level publication split. The verified cohort is passed to
``splits.get_publication_splits`` and immutable artifacts are written under
``artifacts/rescue/splits`` by default.

It never prints final-test rows or image IDs; only aggregate counts and hashes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import warnings
from collections import Counter
from itertools import combinations
from pathlib import Path
from typing import Any

import pandas as pd

ISIC_CLASSES: list[str] = ["MEL", "NV", "BCC", "AK", "BKL", "DF", "VASC", "SCC"]
from splits import (
    _discover_metadata_csv,
    _is_present,
    _norm_image_id,
    attach_lesion_ids,
    get_publication_splits,
)


DEFAULT_OUTPUT_DIR = Path("artifacts/rescue/splits")
MIN_VERIFIED_COHORT_COVERAGE_PCT = 90.0
EXCLUDED_MISSING_LESION_FILENAME = "excluded_missing_lesion_ids.csv"
EXCLUDED_MISSING_LESION_REASON = "missing_verified_lesion_id"
FINAL_TEST_LOW_SUPPORT_THRESHOLD = 10


def discover_isic(root: str = "/kaggle/input") -> tuple[str, str]:
    """Find the ISIC-2019 ground-truth CSV and image directory."""
    class_set = {c.upper() for c in ISIC_CLASSES}
    csv_path: str | None = None
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if not name.lower().endswith(".csv"):
                continue
            path = os.path.join(dirpath, name)
            try:
                cols = {str(c).upper() for c in pd.read_csv(path, nrows=0).columns}
            except Exception:
                continue
            if class_set.issubset(cols):
                csv_path = path
                break
        if csv_path is not None:
            break

    image_dir: str | None = None
    best_count = -1
    for dirpath, _dirnames, filenames in os.walk(root):
        count = sum(
            1
            for name in filenames
            if name.lower().startswith("isic_")
            and name.lower().endswith((".jpg", ".jpeg"))
        )
        if count > best_count:
            best_count = count
            image_dir = dirpath

    if csv_path is None:
        raise FileNotFoundError(f"Could not find ISIC ground-truth CSV under {root!r}.")
    if image_dir is None or best_count <= 0:
        raise FileNotFoundError(f"Could not find ISIC image directory under {root!r}.")
    return csv_path, image_dir


def build_canonical_isic_dataframe(csv_path: str) -> tuple[pd.DataFrame, str, str]:
    """Load the canonical dataframe used by the training notebooks."""
    gt = pd.read_csv(csv_path)
    image_col = "image" if "image" in gt.columns else gt.columns[0]
    col_upper = {str(c).upper(): c for c in gt.columns}
    missing = [name for name in ISIC_CLASSES if name.upper() not in col_upper]
    if missing:
        raise ValueError(f"Ground-truth CSV is missing ISIC class columns: {missing}")
    class_cols = [col_upper[name.upper()] for name in ISIC_CLASSES]
    labels = gt[class_cols].to_numpy().argmax(axis=1).astype(int)
    frame = pd.DataFrame(
        {
            "image": gt[image_col].astype(str),
            "label": labels,
        }
    )
    return frame, "image", "label"


def sha256_file(path: Path) -> str:
    """Return the SHA-256 digest for a file."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _label_counts(df: pd.DataFrame, label_col: str, labels: list[Any] | None = None) -> dict[str, int]:
    counts = df[label_col].value_counts().sort_index().to_dict()
    if labels is None:
        labels = sorted(counts, key=lambda value: str(value))
    return {str(label): int(counts.get(label, 0)) for label in labels}


def dataframe_fingerprint(df: pd.DataFrame, image_col: str, label_col: str, lesion_id_col: str) -> dict[str, Any]:
    """Aggregate-only source dataset fingerprint."""
    normalized_ids = df[image_col].map(_norm_image_id).astype(str).tolist()
    label_counts = _label_counts(df, label_col)
    present = int(sum(_is_present(v) for v in df[lesion_id_col]))
    return {
        "n_rows": int(len(df)),
        "n_unique_normalized_images": int(len(set(normalized_ids))),
        "image_id_sha256": hashlib.sha256("\n".join(sorted(normalized_ids)).encode("utf-8")).hexdigest(),
        "label_counts": label_counts,
        "lesion_id_present": present,
        "lesion_id_missing": int(len(df) - present),
        "lesion_id_coverage_pct": (100.0 * present / len(df)) if len(df) else 0.0,
    }


def build_verified_lesion_cohort(
    df: pd.DataFrame,
    *,
    image_col: str = "image",
    label_col: str = "label",
    lesion_id_col: str = "lesion_id",
    minimum_coverage_pct: float = MIN_VERIFIED_COHORT_COVERAGE_PCT,
    verbose: bool = True,
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Return the verified-lesion cohort, exclusion manifest, and aggregate stats."""
    for required in (image_col, label_col, lesion_id_col):
        if required not in df.columns:
            raise ValueError(f"Required cohort column is missing: {required!r}")

    normalized = df[image_col].map(_norm_image_id)
    conflicts = []
    conflict_frame = pd.DataFrame({"image": normalized, "label": df[label_col]})
    for image_id, group in conflict_frame.groupby("image", sort=True):
        if group["label"].nunique(dropna=False) > 1:
            conflicts.append(str(image_id))
    if conflicts:
        raise ValueError(
            "Conflicting labels for duplicate normalized image ids: "
            f"{conflicts[:10]} (total={len(conflicts)})"
        )

    present_mask = df[lesion_id_col].map(_is_present)
    verified_df = df.loc[present_mask].copy()
    verified_df["_cohort_normalized_image_id"] = verified_df[image_col].map(_norm_image_id)
    verified_df = verified_df.sort_values(
        "_cohort_normalized_image_id", kind="mergesort"
    ).drop(columns="_cohort_normalized_image_id").reset_index(drop=True)

    excluded = df.loc[~present_mask, [image_col, label_col]].copy()
    excluded["_cohort_normalized_image_id"] = excluded[image_col].map(_norm_image_id)
    excluded = excluded.sort_values(
        "_cohort_normalized_image_id", kind="mergesort"
    ).drop(columns="_cohort_normalized_image_id").reset_index(drop=True)
    excluded["reason"] = EXCLUDED_MISSING_LESION_REASON
    excluded = excluded.rename(columns={image_col: "image", label_col: "label"})
    excluded = excluded[["image", "label", "reason"]]

    original_total = int(len(df))
    verified_rows = int(len(verified_df))
    excluded_rows = int(len(excluded))
    coverage = (100.0 * verified_rows / original_total) if original_total else 0.0
    if coverage < minimum_coverage_pct:
        raise ValueError(
            "Verified-lesion publication cohort refused: verified lesion coverage is "
            f"{coverage:.2f}%, below required {minimum_coverage_pct:.1f}%."
        )

    labels = sorted(df[label_col].drop_duplicates().tolist(), key=lambda value: str(value))
    stats = {
        "original_total_rows": original_total,
        "verified_lesion_rows": verified_rows,
        "excluded_missing_lesion_rows": excluded_rows,
        "verified_lesion_coverage_percent": coverage,
        "per_class_counts_before_exclusion": _label_counts(df, label_col, labels),
        "per_class_counts_after_exclusion": _label_counts(verified_df, label_col, labels),
        "per_class_excluded_counts": _label_counts(
            excluded.rename(columns={"label": label_col}), label_col, labels
        ),
    }
    assert verified_rows + excluded_rows == original_total
    assert all(_is_present(value) for value in verified_df[lesion_id_col])

    if verbose:
        print("-- Verified-lesion publication cohort --------------------------")
        print(f"  original rows        : {original_total}")
        print(f"  verified lesion rows : {verified_rows}")
        print(f"  excluded rows        : {excluded_rows}")
        print(f"  verified coverage    : {coverage:.2f}%")
        print("  per-class before/verified/excluded:")
        for label in stats["per_class_counts_before_exclusion"]:
            print(
                f"    {label}: {stats['per_class_counts_before_exclusion'][label]} / "
                f"{stats['per_class_counts_after_exclusion'][label]} / "
                f"{stats['per_class_excluded_counts'][label]}"
            )
    return verified_df, excluded, stats


def split_summary(
    split_frames: dict[str, pd.DataFrame],
    label_col: str,
    image_col: str,
    lesion_id_col: str,
) -> dict[str, Any]:
    """Aggregate-only split summary suitable for publication manifests."""
    total = sum(len(frame) for frame in split_frames.values())
    summary: dict[str, Any] = {"total_rows": int(total), "splits": {}}
    for name, frame in split_frames.items():
        present = int(sum(_is_present(v) for v in frame[lesion_id_col]))
        counts = {
            str(k): int(v)
            for k, v in frame[label_col].value_counts().sort_index().to_dict().items()
        }
        summary["splits"][name] = {
            "rows": int(len(frame)),
            "proportion_of_source": (len(frame) / total) if total else 0.0,
            "proportion_of_verified_cohort": (len(frame) / total) if total else 0.0,
            "class_counts": counts,
            "lesion_id_coverage_pct": (100.0 * present / len(frame)) if len(frame) else 0.0,
        }

    image_overlaps: dict[str, int] = {}
    lesion_id_overlaps: dict[str, int] = {}
    lesion_group_overlaps: dict[str, int] = {}
    for left_name, right_name in combinations(split_frames, 2):
        pair = f"{left_name}__{right_name}"
        left = split_frames[left_name]
        right = split_frames[right_name]
        left_images = {_norm_image_id(value) for value in left[image_col]}
        right_images = {_norm_image_id(value) for value in right[image_col]}
        left_lesions = {str(value).strip() for value in left[lesion_id_col] if _is_present(value)}
        right_lesions = {str(value).strip() for value in right[lesion_id_col] if _is_present(value)}
        left_groups = {str(value) for value in left["lesion_group"]}
        right_groups = {str(value) for value in right["lesion_group"]}
        image_overlaps[pair] = len(left_images & right_images)
        lesion_id_overlaps[pair] = len(left_lesions & right_lesions)
        lesion_group_overlaps[pair] = len(left_groups & right_groups)

    summary["verification"] = {
        "pairwise_image_overlap_counts": image_overlaps,
        "pairwise_lesion_id_overlap_counts": lesion_id_overlaps,
        "pairwise_lesion_group_overlap_counts": lesion_group_overlaps,
        "zero_image_overlap": all(count == 0 for count in image_overlaps.values()),
        "zero_lesion_id_overlap": all(count == 0 for count in lesion_id_overlaps.values()),
        "zero_lesion_group_overlap": all(count == 0 for count in lesion_group_overlaps.values()),
    }
    return summary


def _assert_verified_cohort_assignment(
    verified_df: pd.DataFrame,
    excluded_df: pd.DataFrame,
    split_frames: dict[str, pd.DataFrame],
    *,
    image_col: str,
) -> dict[str, Any]:
    verified_images = Counter(verified_df[image_col].map(_norm_image_id))
    assigned_images: Counter[str] = Counter()
    for frame in split_frames.values():
        assigned_images.update(frame[image_col].map(_norm_image_id))
    assert assigned_images == verified_images, (
        "Verified cohort assignment mismatch: rows were lost, duplicated, or altered."
    )

    excluded_images = set(excluded_df["image"].map(_norm_image_id))
    assigned_image_set = set(assigned_images)
    excluded_overlap = excluded_images & assigned_image_set
    assert not excluded_overlap, (
        "Excluded missing-lesion rows leaked into publication splits: "
        f"{len(excluded_overlap)} image(s)."
    )
    risk_images = set(split_frames["risk_dev"][image_col].map(_norm_image_id))
    final_images = set(split_frames["final_test"][image_col].map(_norm_image_id))
    assert not (risk_images & final_images), "final_test overlaps historic risk_dev."
    return {
        "verified_rows_assigned_exactly_once": True,
        "excluded_image_overlap_count": 0,
        "no_excluded_rows_in_splits": True,
        "risk_dev_final_test_image_overlap_count": 0,
    }


def _warn_for_low_final_test_support(
    final_test_df: pd.DataFrame,
    label_col: str,
    expected_labels: list[Any],
) -> None:
    counts = _label_counts(final_test_df, label_col, expected_labels)
    for label, count in counts.items():
        if count < FINAL_TEST_LOW_SUPPORT_THRESHOLD:
            warnings.warn(
                "FINAL_TEST LOW SUPPORT: "
                f"class {label} has only {count} row(s); threshold is "
                f"{FINAL_TEST_LOW_SUPPORT_THRESHOLD}.",
                RuntimeWarning,
                stacklevel=2,
            )


def _print_locked_split_summary(split_frames: dict[str, pd.DataFrame], label_col: str) -> None:
    total = sum(len(frame) for frame in split_frames.values())
    labels = sorted(
        {label for frame in split_frames.values() for label in frame[label_col]},
        key=lambda value: str(value),
    )
    print("-- Verified-cohort publication splits --------------------------")
    for name, frame in split_frames.items():
        proportion = (100.0 * len(frame) / total) if total else 0.0
        counts = _label_counts(frame, label_col, labels)
        print(f"  {name:10s}: {len(frame):6d} rows ({proportion:6.2f}%)")
        for label, count in counts.items():
            print(f"    class {label}: {count}")
    print("-----------------------------------------------------------------")


def write_locked_split_artifacts(
    train_df: pd.DataFrame,
    model_val_df: pd.DataFrame,
    risk_dev_df: pd.DataFrame,
    final_test_df: pd.DataFrame,
    *,
    output_dir: Path,
    label_col: str = "label",
    image_col: str = "image",
    lesion_id_col: str = "lesion_id",
    source_fingerprint: dict[str, Any] | None = None,
    verified_df: pd.DataFrame | None = None,
    excluded_missing_lesion_df: pd.DataFrame | None = None,
    cohort_summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Write split CSVs, summary, hashes and dataset fingerprint."""
    output_dir.mkdir(parents=True, exist_ok=True)
    split_frames = {
        "train": train_df,
        "model_val": model_val_df,
        "risk_dev": risk_dev_df,
        "final_test": final_test_df,
    }
    csv_names = {
        "train": "train.csv",
        "model_val": "model_val.csv",
        "risk_dev": "risk_dev.csv",
        "final_test": "final_test_LOCKED.csv",
    }

    csv_paths: dict[str, Path] = {}
    for name, frame in split_frames.items():
        path = output_dir / csv_names[name]
        frame.to_csv(path, index=False)
        csv_paths[name] = path

    if excluded_missing_lesion_df is None:
        excluded_missing_lesion_df = pd.DataFrame(columns=["image", "label", "reason"])
    if list(excluded_missing_lesion_df.columns) != ["image", "label", "reason"]:
        raise ValueError(
            "Excluded manifest must contain exactly: image, label, reason."
        )
    excluded_path = output_dir / EXCLUDED_MISSING_LESION_FILENAME
    excluded_missing_lesion_df.to_csv(excluded_path, index=False)
    csv_paths["excluded_missing_lesion_ids"] = excluded_path

    hashes = {path.name: sha256_file(path) for path in csv_paths.values()}
    hashes_path = output_dir / "split_hashes.json"
    hashes_path.write_text(json.dumps(hashes, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    summary = split_summary(split_frames, label_col, image_col, lesion_id_col)
    if cohort_summary:
        summary.update(cohort_summary)
    assignment_checks = {}
    if verified_df is not None:
        assignment_checks = _assert_verified_cohort_assignment(
            verified_df,
            excluded_missing_lesion_df,
            split_frames,
            image_col=image_col,
        )
    summary["verification"].update(assignment_checks)
    summary["verification"]["all_csv_hashes_verified"] = all(
        sha256_file(path) == hashes[path.name] for path in csv_paths.values()
    )
    summary["verified_lesion_only_cohort"] = True
    summary["excluded_missing_lesion_ids_sha256"] = hashes[excluded_path.name]
    summary["csv_sha256"] = hashes
    summary_path = output_dir / "split_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    fingerprint = dict(source_fingerprint or {})
    fingerprint.update(
        {
            "split_protocol": "publication_rescue_v1",
            "cohort_policy": "verified_lesion_only",
            "verified_lesion_only_cohort": True,
            "missing_lesion_id_policy": "excluded",
            "image_col": image_col,
            "label_col": label_col,
            "lesion_id_col": lesion_id_col,
            "excluded_missing_lesion_ids_sha256": hashes[excluded_path.name],
        }
    )
    if cohort_summary:
        fingerprint.update(
            {
                key: cohort_summary[key]
                for key in (
                    "original_total_rows",
                    "verified_lesion_rows",
                    "excluded_missing_lesion_rows",
                    "verified_lesion_coverage_percent",
                )
            }
        )
    fingerprint_path = output_dir / "dataset_fingerprint.json"
    fingerprint_path.write_text(
        json.dumps(fingerprint, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    return {
        "csv_paths": {name: str(path) for name, path in csv_paths.items()},
        "hashes": hashes,
        "hashes_path": str(hashes_path),
        "summary_path": str(summary_path),
        "fingerprint_path": str(fingerprint_path),
        "summary": summary,
    }


def create_locked_publication_splits(
    input_root: str = "/kaggle/input",
    output_dir: Path = DEFAULT_OUTPUT_DIR,
    ground_truth_csv: str | None = None,
    metadata_path: str | None = None,
    image_dir: str | None = None,
    verbose: bool = True,
) -> dict[str, Any]:
    """Create publication splits from rows carrying verified official lesion IDs."""
    if ground_truth_csv is not None:
        csv_path = os.path.abspath(ground_truth_csv)
        if not os.path.isfile(csv_path):
            raise FileNotFoundError(f"Ground-truth CSV does not exist: {csv_path}")
        resolved_image_dir = os.path.abspath(image_dir) if image_dir else None
        if resolved_image_dir is not None and not os.path.isdir(resolved_image_dir):
            raise FileNotFoundError(f"Image directory does not exist: {resolved_image_dir}")
    else:
        csv_path, discovered_image_dir = discover_isic(input_root)
        resolved_image_dir = os.path.abspath(image_dir or discovered_image_dir)

    frame, image_col, label_col = build_canonical_isic_dataframe(csv_path)
    metadata = metadata_path or _discover_metadata_csv((input_root, "/kaggle/working", "."))
    if metadata is None:
        raise FileNotFoundError(
            "No lesion metadata CSV found. Publication splits require verified lesion metadata."
        )
    metadata = os.path.abspath(metadata)
    if not os.path.isfile(metadata):
        raise FileNotFoundError(f"Metadata CSV does not exist: {metadata}")
    frame = attach_lesion_ids(
        frame,
        image_col=image_col,
        metadata_path=metadata,
        lesion_id_col="lesion_id",
        verbose=verbose,
    )
    source_fingerprint = dataframe_fingerprint(frame, image_col, label_col, "lesion_id")
    verified_df, excluded_df, cohort_summary = build_verified_lesion_cohort(
        frame,
        image_col=image_col,
        label_col=label_col,
        lesion_id_col="lesion_id",
        verbose=verbose,
    )
    fingerprint = dataframe_fingerprint(verified_df, image_col, label_col, "lesion_id")
    fingerprint.update(
        {
            "ground_truth_csv": os.path.abspath(csv_path),
            "ground_truth_csv_sha256": sha256_file(Path(csv_path)),
            "image_dir": resolved_image_dir,
            "metadata_csv": os.path.abspath(metadata),
            "metadata_csv_sha256": sha256_file(Path(metadata)),
            "original_dataset_fingerprint": source_fingerprint,
        }
    )
    train_df, model_val_df, risk_dev_df, final_test_df = get_publication_splits(
        verified_df,
        label_col=label_col,
        image_col=image_col,
        lesion_id_col="lesion_id",
        verbose=False,
    )
    split_frames = {
        "train": train_df,
        "model_val": model_val_df,
        "risk_dev": risk_dev_df,
        "final_test": final_test_df,
    }
    if verbose:
        _print_locked_split_summary(split_frames, label_col)
    manifest = write_locked_split_artifacts(
        train_df,
        model_val_df,
        risk_dev_df,
        final_test_df,
        output_dir=output_dir,
        label_col=label_col,
        image_col=image_col,
        lesion_id_col="lesion_id",
        source_fingerprint=fingerprint,
        verified_df=verified_df,
        excluded_missing_lesion_df=excluded_df,
        cohort_summary=cohort_summary,
    )
    expected_labels = sorted(
        verified_df[label_col].drop_duplicates().tolist(), key=lambda value: str(value)
    )
    _warn_for_low_final_test_support(final_test_df, label_col, expected_labels)
    if verbose:
        print("Locked split artifacts written:")
        print(f"  split_summary      : {manifest['summary_path']}")
        print(f"  dataset_fingerprint: {manifest['fingerprint_path']}")
        print(f"  split_hashes       : {manifest['hashes_path']}")
        print(f"  excluded rows      : {manifest['csv_paths']['excluded_missing_lesion_ids']}")
        print("  CSV SHA-256:")
        for name, digest in manifest["hashes"].items():
            print(f"    {name}: {digest}")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog=(
            "This publication experiment intentionally excludes rows without a "
            "verified lesion_id. Missing IDs are never synthesized and publication "
            "splits never fall back to image-level grouping."
        ),
    )
    parser.add_argument(
        "--input-root",
        default="/kaggle/input",
        help="Auto-discovery root used when --ground-truth-csv is omitted.",
    )
    parser.add_argument("--ground-truth-csv", default=None)
    parser.add_argument("--metadata-csv", default=None)
    parser.add_argument(
        "--metadata-path",
        default=None,
        help="Deprecated alias for --metadata-csv.",
    )
    parser.add_argument(
        "--image-dir",
        default=None,
        help="Optional image directory recorded in the fingerprint; images are not read.",
    )
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    if args.metadata_csv and args.metadata_path:
        parser.error("Use only one of --metadata-csv or --metadata-path.")
    create_locked_publication_splits(
        input_root=args.input_root,
        output_dir=Path(args.output_dir),
        ground_truth_csv=args.ground_truth_csv,
        metadata_path=args.metadata_csv or args.metadata_path,
        image_dir=args.image_dir,
        verbose=not args.quiet,
    )


if __name__ == "__main__":
    main()
