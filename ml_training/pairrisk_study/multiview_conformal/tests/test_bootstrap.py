import numpy as np
import pandas as pd

from multiview_conformal.bootstrap import paired_bootstrap_differences


def test_paired_bootstrap_known_set_size_difference():
    rows = []
    for i in range(50):
        for method, size in (("a", 1), ("b", 2)):
            rows.append(
                {
                    "lesion_group": f"L{i}",
                    "method": method,
                    "covered": True,
                    "set_size": size,
                    "singleton": size == 1,
                    "singleton_correct": size == 1,
                    "pair_support": 1.0 if size == 1 else np.nan,
                }
            )
    result = paired_bootstrap_differences(
        pd.DataFrame(rows), comparisons=(("a", "b"),), replicates=200
    )
    set_row = result[result.metric == "average_set_size"].iloc[0]
    assert set_row.estimate == -1.0
    assert set_row.ci_low == -1.0
    assert set_row.ci_high == -1.0
