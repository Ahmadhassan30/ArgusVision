"""Create locked publication-safe Argus Vision split CSVs.

This script rebuilds the canonical ISIC dataframe, attaches lesion metadata, calls
``splits.get_publication_splits`` and writes immutable split artifacts under
``artifacts/rescue/splits`` by default.

It never prints final-test rows or image IDs; only aggregate counts and hashes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
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


def dataframe_fingerprint(df: pd.DataFrame, image_col: str, label_col: str, lesion_id_col: str) -> dict[str, Any]:
    """Aggregate-only source dataset fingerprint."""
    normalized_ids = df[image_col].map(_norm_image_id).astype(str).tolist()
    label_counts = {
        str(k): int(v)
        for k, v in df[label_col].value_counts().sort_index().to_dict().items()
    }
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


def split_summary(split_frames: dict[str, pd.DataFrame], label_col: str, lesion_id_col: str) -> dict[str, Any]:
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
            "class_counts": counts,
            "lesion_id_coverage_pct": (100.0 * present / len(frame)) if len(frame) else 0.0,
        }
    return summary


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

    hashes = {path.name: sha256_file(path) for path in csv_paths.values()}
    hashes_path = output_dir / "split_hashes.json"
    hashes_path.write_text(json.dumps(hashes, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    summary = split_summary(split_frames, label_col, lesion_id_col)
    summary["csv_sha256"] = hashes
    summary_path = output_dir / "split_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    fingerprint = source_fingerprint or {}
    fingerprint.update(
        {
            "split_protocol": "publication_rescue_v1",
            "image_col": image_col,
            "label_col": label_col,
            "lesion_id_col": lesion_id_col,
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
    metadata_path: str | None = None,
    verbose: bool = True,
) -> dict[str, Any]:
    """Create and save publication split artifacts from an ISIC input root."""
    csv_path, image_dir = discover_isic(input_root)
    frame, image_col, label_col = build_canonical_isic_dataframe(csv_path)
    metadata = metadata_path or _discover_metadata_csv((input_root, "/kaggle/working", "."))
    if metadata is None:
        raise FileNotFoundError(
            "No lesion metadata CSV found. Publication splits require verified lesion metadata."
        )
    frame = attach_lesion_ids(
        frame,
        image_col=image_col,
        metadata_path=metadata,
        lesion_id_col="lesion_id",
        verbose=verbose,
    )
    fingerprint = dataframe_fingerprint(frame, image_col, label_col, "lesion_id")
    fingerprint.update(
        {
            "ground_truth_csv": os.path.abspath(csv_path),
            "image_dir": os.path.abspath(image_dir),
            "metadata_csv": os.path.abspath(metadata),
        }
    )
    train_df, model_val_df, risk_dev_df, final_test_df = get_publication_splits(
        frame,
        label_col=label_col,
        image_col=image_col,
        lesion_id_col="lesion_id",
        verbose=verbose,
    )
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
    )
    if verbose:
        print("Locked split artifacts written:")
        print(f"  split_summary      : {manifest['summary_path']}")
        print(f"  dataset_fingerprint: {manifest['fingerprint_path']}")
        print(f"  split_hashes       : {manifest['hashes_path']}")
        print("  CSV SHA-256:")
        for name, digest in manifest["hashes"].items():
            print(f"    {name}: {digest}")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-root", default="/kaggle/input")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--metadata-path", default=None)
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()
    create_locked_publication_splits(
        input_root=args.input_root,
        output_dir=Path(args.output_dir),
        metadata_path=args.metadata_path,
        verbose=not args.quiet,
    )


if __name__ == "__main__":
    main()
