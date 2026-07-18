from pathlib import Path

import numpy as np
import pandas as pd

from multiview_conformal.constants import CLASS_ORDER
from multiview_conformal.lesion_bags import (
    build_lesion_table,
    collapse_exact_duplicates,
    split_design_calibration,
    validate_predictions,
)


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
