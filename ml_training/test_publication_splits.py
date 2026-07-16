from __future__ import annotations

import hashlib
import json
import os
import sys
from collections import Counter

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from create_locked_publication_splits import write_locked_split_artifacts
from splits import (
    get_lesion_grouped_split,
    get_publication_splits,
    _norm_image_id,
)


def _synthetic_frame(n_classes: int = 4, groups_per_class: int = 14) -> pd.DataFrame:
    rows = []
    for label in range(n_classes):
        for group_idx in range(groups_per_class):
            lesion_id = f"L_{label}_{group_idx:03d}"
            # Two images per lesion exercises grouped splitting and row reconstruction.
            for view in range(2):
                rows.append(
                    {
                        "image": f"ISIC_{label}{group_idx:03d}{view}",
                        "label": label,
                        "lesion_id": lesion_id,
                    }
                )
    # Reverse order so determinism depends on internal normalized-image sorting.
    return pd.DataFrame(reversed(rows)).reset_index(drop=True)


def _as_split_map(result):
    names = ("train", "model_val", "risk_dev", "final_test")
    return dict(zip(names, result))


def _image_set(frame: pd.DataFrame) -> set[str]:
    if "_normalized_image_id" in frame.columns:
        return set(frame["_normalized_image_id"])
    return {str(_norm_image_id(value)) for value in frame["image"]}


def _lesion_set(frame: pd.DataFrame) -> set[str]:
    return set(frame["lesion_group"])


def test_publication_splits_are_deterministic() -> None:
    df = _synthetic_frame()
    first = get_publication_splits(df, label_col="label", image_col="image", verbose=False)
    second = get_publication_splits(df.sample(frac=1, random_state=123), label_col="label", image_col="image", verbose=False)
    for left, right in zip(first, second):
        assert left["_normalized_image_id"].tolist() == right["_normalized_image_id"].tolist()
        assert left["research_split"].tolist() == right["research_split"].tolist()


def test_publication_splits_are_pairwise_image_and_lesion_disjoint() -> None:
    splits = _as_split_map(get_publication_splits(_synthetic_frame(), label_col="label", image_col="image", verbose=False))
    names = list(splits)
    for i, left_name in enumerate(names):
        for right_name in names[i + 1 :]:
            assert _image_set(splits[left_name]).isdisjoint(_image_set(splits[right_name]))
            assert _lesion_set(splits[left_name]).isdisjoint(_lesion_set(splits[right_name]))


def test_publication_splits_reconstruct_all_rows_once() -> None:
    df = _synthetic_frame()
    splits = get_publication_splits(df, label_col="label", image_col="image", verbose=False)
    original_images = Counter(df["image"].str.lower())
    assigned_images = Counter()
    assigned_labels = Counter()
    for frame in splits:
        assigned_images.update(frame["_normalized_image_id"])
        assigned_labels.update(frame["label"])
    assert assigned_images == original_images
    assert assigned_labels == Counter(df["label"])
    assert sum(len(frame) for frame in splits) == len(df)


def test_old_risk_dev_is_disjoint_from_final_test() -> None:
    train, model_val, risk_dev, final_test = get_publication_splits(
        _synthetic_frame(),
        label_col="label",
        image_col="image",
        verbose=False,
    )
    assert _image_set(risk_dev).isdisjoint(_image_set(final_test))
    assert _lesion_set(risk_dev).isdisjoint(_lesion_set(final_test))
    assert set(final_test["research_split"]) == {"final_test"}
    assert set(risk_dev["research_split"]) == {"risk_dev"}
    assert train is not None and model_val is not None


def test_different_seeds_still_preserve_groups() -> None:
    df = _synthetic_frame()
    for seed in (1, 2, 99):
        train_df, val_df = get_lesion_grouped_split(
            df,
            label_col="label",
            image_col="image",
            test_size=0.25,
            random_state=seed,
            verbose=False,
        )
        assert _image_set(train_df).isdisjoint(_image_set(val_df))
        assert _lesion_set(train_df).isdisjoint(_lesion_set(val_df))


def test_publication_split_fails_when_lesion_coverage_is_inadequate() -> None:
    df = _synthetic_frame()
    df.loc[df.index[: len(df) // 2], "lesion_id"] = None
    try:
        get_publication_splits(df, label_col="label", image_col="image", verbose=False)
    except ValueError as exc:
        assert "lesion metadata coverage" in str(exc)
    else:
        raise AssertionError("Expected inadequate lesion coverage to fail loudly.")


def test_conflicting_duplicate_image_labels_fail() -> None:
    df = _synthetic_frame()
    dup = df.iloc[[0]].copy()
    dup["label"] = int(dup["label"].iloc[0]) + 1
    df = pd.concat([df, dup], ignore_index=True)
    try:
        get_publication_splits(df, label_col="label", image_col="image", verbose=False)
    except ValueError as exc:
        assert "Conflicting labels" in str(exc)
    else:
        raise AssertionError("Expected conflicting duplicate image labels to fail.")


def test_class_count_reporting_warns_for_absent_classes(capsys) -> None:
    df = _synthetic_frame(n_classes=3, groups_per_class=3)
    get_publication_splits(df, label_col="label", image_col="image", verbose=True)
    captured = capsys.readouterr()
    assert "Publication split summary" in captured.out
    assert "class" in captured.out
    assert "WARNING:" in captured.out


def test_manifest_hashes(tmp_path) -> None:
    splits = get_publication_splits(_synthetic_frame(), label_col="label", image_col="image", verbose=False)
    manifest = write_locked_split_artifacts(
        *splits,
        output_dir=tmp_path,
        label_col="label",
        image_col="image",
        lesion_id_col="lesion_id",
        source_fingerprint={"n_rows": sum(len(frame) for frame in splits)},
    )
    for filename, digest in manifest["hashes"].items():
        path = tmp_path / filename
        assert path.exists()
        assert hashlib.sha256(path.read_bytes()).hexdigest() == digest

    hashes = json.loads((tmp_path / "split_hashes.json").read_text(encoding="utf-8"))
    summary = json.loads((tmp_path / "split_summary.json").read_text(encoding="utf-8"))
    fingerprint = json.loads((tmp_path / "dataset_fingerprint.json").read_text(encoding="utf-8"))
    assert hashes == manifest["hashes"]
    assert summary["csv_sha256"] == hashes
    assert fingerprint["split_protocol"] == "publication_rescue_v1"
