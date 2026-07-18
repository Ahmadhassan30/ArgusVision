import numpy as np
import pandas as pd

from multiview_conformal.bootstrap import paired_bootstrap_differences
from multiview_conformal.constants import CLASS_ORDER, GLOBAL_LME_TAU, LME_TAU_GRID
from multiview_conformal.design_analysis import cross_fitted_method, nested_lme_cross_fitted
from multiview_conformal.evaluate import build_lesion_records
from multiview_conformal.power_analysis import power_precision_sensitivity
from multiview_conformal.view_count_analysis import paired_view_count_correlation_bootstrap


def make_records(n_lesions=50, seed=17):
    rng = np.random.default_rng(seed)
    rows = []
    for lesion_index in range(n_lesions):
        label = lesion_index % len(CLASS_ORDER)
        for view_index in range(2 + lesion_index % 3):
            probabilities = rng.dirichlet(np.ones(len(CLASS_ORDER)))
            probabilities[label] += 0.5
            probabilities /= probabilities.sum()
            row = {
                "image": f"I{lesion_index}_{view_index}",
                "lesion_group": f"L:{lesion_index}",
                "lesion_id": str(lesion_index),
                "label": label,
                "label_name": CLASS_ORDER[label],
            }
            row.update(
                {
                    f"ensemble_probability_{name}": probabilities[class_index]
                    for class_index, name in enumerate(CLASS_ORDER)
                }
            )
            rows.append(row)
    return build_lesion_records(pd.DataFrame(rows))


def test_nested_lme_uses_five_outer_folds_and_frozen_grid():
    records = make_records()
    folds, lesions, selections = nested_lme_cross_fitted(records, seed=2026)

    assert folds["outer_fold"].tolist() == [1, 2, 3, 4, 5]
    assert selections["outer_fold"].tolist() == [1, 2, 3, 4, 5]
    assert set(selections["selected_tau"]).issubset(set(LME_TAU_GRID))
    assert len(lesions) == len(records)
    assert lesions["lesion_group"].is_unique
    assert set(lesions["method"]) == {"nested_logmeanexp"}
    selected_by_fold = selections.set_index("outer_fold")["selected_tau"]
    observed_by_fold = lesions.groupby("fold")["tau"].first()
    pd.testing.assert_series_equal(observed_by_fold, selected_by_fold, check_names=False)
    assert GLOBAL_LME_TAU == 0.05


def test_nested_lme_is_pairable_with_pairrisk_by_lesion():
    records = make_records()
    _, nested_lesions, _ = nested_lme_cross_fitted(records, seed=2026)
    _, pairrisk_lesions = cross_fitted_method(records, method="pairrisk", seed=2026)
    comparison = paired_bootstrap_differences(
        pd.concat([pairrisk_lesions, nested_lesions], ignore_index=True),
        comparisons=(("pairrisk", "nested_logmeanexp"),),
        replicates=100,
        seed=2026,
    )

    assert not comparison.empty
    assert set(comparison["method_a"]) == {"pairrisk"}
    assert set(comparison["method_b"]) == {"nested_logmeanexp"}


def test_power_precision_sensitivity_has_all_frozen_scenarios():
    differences = np.linspace(-0.5, 0.3, 60)
    result = power_precision_sensitivity(
        differences,
        reference_set_size=2.0,
        simulations=1,
        bootstrap_replicates=100,
        seed=2026,
    )

    assert len(result) == 12
    assert set(result["target_n"]) == {350, 493, 650}
    assert set(result["relative_set_size_effect_percent"]) == {2.0, 3.0, 5.0, 10.0}
    planning = result[result["target_n"] == 493]
    assert planning["development_derived_planning_estimate"].all()
    assert planning["sample_size_role"].str.contains("not an observed final-test").all()
    assert not result.loc[result["target_n"] != 493, "development_derived_planning_estimate"].any()


def test_paired_view_count_correlation_bootstrap_is_deterministic():
    n_views = np.tile(np.arange(2, 7), 12)
    frame = pd.DataFrame(
        {
            "lesion_group": [f"L:{index}" for index in range(len(n_views))],
            "n_views": n_views,
            "true_score_max": n_views + np.linspace(0.0, 0.2, len(n_views)),
            "true_score_pairrisk": -n_views + np.linspace(0.0, 0.2, len(n_views)),
        }
    )
    first = paired_view_count_correlation_bootstrap(frame, replicates=100, seed=2026)
    second = paired_view_count_correlation_bootstrap(frame, replicates=100, seed=2026)

    pd.testing.assert_frame_equal(first, second)
    row = first.iloc[0]
    assert np.isclose(
        row["estimate"],
        row["rho_max_score_vs_view_count"] - row["rho_pairrisk_score_vs_view_count"],
    )
    assert row["sampling_unit"] == "lesion_group"
    assert row["valid_replicates"] + row["invalid_replicates"] == 100
