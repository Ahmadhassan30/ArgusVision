import numpy as np
import pandas as pd

from generate_design_report import choose_decision, pooled_method_metrics


def test_pooled_method_metrics_known_values():
    frame = pd.DataFrame(
        {
            "covered": [True, False, True, True],
            "set_size": [1, 2, 1, 8],
            "singleton": [True, False, True, False],
            "singleton_correct": [True, False, False, False],
            "pair_support": [1.0, np.nan, 0.5, np.nan],
        }
    )
    result = pooled_method_metrics(frame)
    assert result["coverage"] == 0.75
    assert result["average_set_size"] == 3.0
    assert result["median_set_size"] == 1.5
    assert result["singleton_rate"] == 0.5
    assert result["singleton_accuracy"] == 0.5
    assert result["conditional_singleton_consistency"] == 0.75
    assert result["safe_singleton_yield"] == 0.375
    assert result["full_set_rate"] == 0.25


def test_decision_requires_more_than_one_favorable_point_estimate():
    assert choose_decision(
        pair_max_relative_reduction=0.03,
        pair_max_set_size_ci_high=0.02,
        view_count_difference_ci_low=0.19,
        nested_set_size_ci_low=-0.03,
        power_for_five_percent_at_493=0.868,
    ) == "COUNT_SENSITIVITY_PAPER_GO"

    assert choose_decision(
        pair_max_relative_reduction=0.06,
        pair_max_set_size_ci_high=-0.01,
        view_count_difference_ci_low=0.19,
        nested_set_size_ci_low=-0.03,
        power_for_five_percent_at_493=0.90,
    ) == "FULL_PAIRRISK_GO"

    assert choose_decision(
        pair_max_relative_reduction=0.03,
        pair_max_set_size_ci_high=0.02,
        view_count_difference_ci_low=-0.01,
        nested_set_size_ci_low=-0.03,
        power_for_five_percent_at_493=0.60,
    ) == "FALLBACK_MSP"
