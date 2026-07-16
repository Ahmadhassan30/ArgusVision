from __future__ import annotations

import hashlib
import json
import os
import sys
from collections import Counter

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from create_locked_publication_splits import (
    EXCLUDED_MISSING_LESION_REASON,
    build_verified_lesion_cohort,
    dataframe_fingerprint,
    write_locked_split_artifacts,
)
from splits import (
    _prepare_publication_dataframe,
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
    assert summary["verification"]["zero_image_overlap"] is True
    assert summary["verification"]["zero_lesion_id_overlap"] is True
    assert summary["verification"]["zero_lesion_group_overlap"] is True
    assert all(
        count == 0
        for counts in (
            summary["verification"]["pairwise_image_overlap_counts"],
            summary["verification"]["pairwise_lesion_id_overlap_counts"],
            summary["verification"]["pairwise_lesion_group_overlap_counts"],
        )
        for count in counts.values()
    )
    assert fingerprint["split_protocol"] == "publication_rescue_v1"


def test_verified_lesion_only_mode_passes_at_official_coverage() -> None:
    total = 25_331
    verified = 23_247
    frame = pd.DataFrame(
        {
            "image": [f"ISIC_{index:07d}" for index in range(total)],
            "label": [index % 8 for index in range(total)],
            "lesion_id": [
                f"L_{index:07d}" if index < verified else None
                for index in range(total)
            ],
        }
    )
    verified_df, excluded_df, stats = build_verified_lesion_cohort(frame, verbose=False)
    assert len(verified_df) == verified
    assert len(excluded_df) == total - verified
    assert stats["verified_lesion_coverage_percent"] == 100.0 * verified / total
    assert stats["verified_lesion_coverage_percent"] > 90.0


def test_verified_cohort_outputs_exclusions_and_prevents_leakage(tmp_path) -> None:
    frame = _synthetic_frame()
    missing_images = set(frame.loc[frame.index[:8], "image"])
    frame.loc[frame.index[:8], "lesion_id"] = None
    verified_df, excluded_df, cohort_stats = build_verified_lesion_cohort(
        frame, verbose=False
    )
    splits = get_publication_splits(
        verified_df,
        label_col="label",
        image_col="image",
        verbose=False,
    )
    manifest = write_locked_split_artifacts(
        *splits,
        output_dir=tmp_path,
        source_fingerprint=dataframe_fingerprint(
            verified_df, "image", "label", "lesion_id"
        ),
        verified_df=verified_df,
        excluded_missing_lesion_df=excluded_df,
        cohort_summary=cohort_stats,
    )

    assigned_images = set().union(*(_image_set(split) for split in splits))
    assert assigned_images.isdisjoint({image.lower() for image in missing_images})
    assert sum(len(split) for split in splits) == len(verified_df)
    assert len(verified_df) + len(excluded_df) == len(frame)

    excluded_path = tmp_path / "excluded_missing_lesion_ids.csv"
    saved_excluded = pd.read_csv(excluded_path)
    assert list(saved_excluded.columns) == ["image", "label", "reason"]
    assert set(saved_excluded["reason"]) == {EXCLUDED_MISSING_LESION_REASON}
    assert set(saved_excluded["image"]) == missing_images
    assert manifest["hashes"][excluded_path.name] == hashlib.sha256(
        excluded_path.read_bytes()
    ).hexdigest()

    summary = json.loads((tmp_path / "split_summary.json").read_text(encoding="utf-8"))
    fingerprint = json.loads(
        (tmp_path / "dataset_fingerprint.json").read_text(encoding="utf-8")
    )
    assert summary["original_total_rows"] == len(frame)
    assert summary["verified_lesion_rows"] == len(verified_df)
    assert summary["excluded_missing_lesion_rows"] == len(excluded_df)
    assert summary["verification"]["no_excluded_rows_in_splits"] is True
    assert summary["verification"]["verified_rows_assigned_exactly_once"] is True
    assert summary["excluded_missing_lesion_ids_sha256"] == manifest["hashes"][excluded_path.name]
    assert fingerprint["verified_lesion_only_cohort"] is True
    assert fingerprint["cohort_policy"] == "verified_lesion_only"
    assert fingerprint["n_rows"] == len(verified_df)


def test_verified_historic_partition_is_risk_dev_and_final_comes_from_old_pool() -> None:
    frame = _synthetic_frame()
    frame.loc[frame.index[:8], "lesion_id"] = None
    verified_df, _excluded_df, _stats = build_verified_lesion_cohort(
        frame, verbose=False
    )
    ordered = _prepare_publication_dataframe(
        verified_df, "label", "image", "lesion_id"
    )
    old_train_pool, expected_risk_dev = get_lesion_grouped_split(
        ordered,
        label_col="label",
        image_col="image",
        test_size=0.15,
        random_state=42,
        verbose=False,
    )
    train, model_val, risk_dev, final_test = get_publication_splits(
        verified_df,
        label_col="label",
        image_col="image",
        verbose=False,
    )
    assert _image_set(risk_dev) == _image_set(expected_risk_dev)
    assert _image_set(final_test).issubset(_image_set(old_train_pool))
    assert _image_set(final_test).isdisjoint(_image_set(risk_dev))
    assert sum(map(len, (train, model_val, risk_dev, final_test))) == len(verified_df)
