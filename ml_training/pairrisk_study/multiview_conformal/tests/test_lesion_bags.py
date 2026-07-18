from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from multiview_conformal.constants import CLASS_ORDER
from multiview_conformal.lesion_bags import (
    build_lesion_table,
    collapse_exact_duplicates,
    load_frozen_lesion_split,
    split_design_calibration,
    validate_predictions,
)
from multiview_conformal import run_initial_implementation


def make_frame(n_per_stratum=2):
    rows = []
    counter = 0
    for label, label_name in enumerate(CLASS_ORDER):
        for view_count in (1, 2, 3):
            for _ in range(n_per_stratum):
                lesion = f"L{counter}"
                for view in range(view_count):
                    probs = np.full(len(CLASS_ORDER), 0.01)
                    probs[label] = 0.93
                    probs /= probs.sum()
                    row = {
                        "image": f"I{counter}_{view}",
                        "_normalized_image_id": f"I{counter}_{view}",
                        "lesion_group": lesion,
                        "lesion_id": lesion,
                        "label": label,
                        "label_name": label_name,
                    }
                    row.update(
                        {f"ensemble_probability_{name}": probs[i] for i, name in enumerate(CLASS_ORDER)}
                    )
                    rows.append(row)
                counter += 1
    return pd.DataFrame(rows)


def test_split_has_no_overlap_and_preserves_rows():
    frame = validate_predictions(make_frame())
    lesion = build_lesion_table(frame)
    split = split_design_calibration(lesion)
    design = set(split.loc[split.analysis_split == "risk_design", "lesion_group"])
    calibration = set(split.loc[split.analysis_split == "risk_calibration", "lesion_group"])
    assert not design & calibration
    assert len(design | calibration) == len(lesion)


def test_duplicate_normalized_id_collapsed():
    frame = make_frame()
    duplicate = frame.iloc[[0]].copy()
    frame = pd.concat([frame, duplicate], ignore_index=True)
    deduped, audit, _ = collapse_exact_duplicates(frame)
    assert audit.duplicate_normalized_ids_removed == 1
    assert len(deduped) == len(frame) - 1


def _write_frozen_split(tmp_path, table):
    path = tmp_path / "lesion_split.csv"
    table.to_csv(path, index=False)
    return path


def test_frozen_split_reuses_exact_assignments_without_regeneration(tmp_path, monkeypatch):
    lesion = build_lesion_table(make_frame())
    frozen = split_design_calibration(lesion).sample(frac=1.0, random_state=7)
    path = _write_frozen_split(tmp_path, frozen)

    def fail_if_called(*args, **kwargs):
        raise AssertionError("split_design_calibration must not run for --split-file")

    monkeypatch.setattr(run_initial_implementation, "split_design_calibration", fail_if_called)
    reused, mode = run_initial_implementation._resolve_split_table(lesion, path)

    assert mode == "frozen_split_file"
    expected = frozen.set_index("lesion_group")["analysis_split"].sort_index()
    actual = reused.set_index("lesion_group")["analysis_split"].sort_index()
    pd.testing.assert_series_equal(actual, expected)


def test_frozen_split_rejects_duplicate_lesion_assignment(tmp_path):
    lesion = build_lesion_table(make_frame())
    frozen = split_design_calibration(lesion)
    frozen = pd.concat([frozen, frozen.iloc[[0]]], ignore_index=True)
    path = _write_frozen_split(tmp_path, frozen)
    with pytest.raises(ValueError, match="more than once"):
        load_frozen_lesion_split(path, lesion)


def test_frozen_split_rejects_unknown_and_missing_lesions(tmp_path):
    lesion = build_lesion_table(make_frame())
    frozen = split_design_calibration(lesion)
    frozen.loc[0, ["lesion_group", "lesion_id"]] = ["L_UNKNOWN", "L_UNKNOWN"]
    path = _write_frozen_split(tmp_path, frozen)
    with pytest.raises(ValueError, match="mismatch"):
        load_frozen_lesion_split(path, lesion)


def test_frozen_split_rejects_lesion_identity_remapping(tmp_path):
    lesion = build_lesion_table(make_frame())
    frozen = split_design_calibration(lesion)
    first, second = frozen.index[:2]
    frozen.loc[[first, second], "lesion_id"] = frozen.loc[
        [second, first], "lesion_id"
    ].to_numpy()
    path = _write_frozen_split(tmp_path, frozen)
    with pytest.raises(ValueError, match="mapping mismatch"):
        load_frozen_lesion_split(path, lesion)
