"""Run the first implementation stage on Stage 5 risk-development predictions.

This script never reads any file whose path contains ``final_test``.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

from .bootstrap import paired_bootstrap_differences
from .constants import GLOBAL_LME_TAU, PRIMARY_ALPHA, RANDOM_SEED
from .design_analysis import cross_fitted_method, nested_lme_cross_fitted
from .evaluate import build_lesion_records
from .lesion_bags import (
    build_lesion_table,
    collapse_exact_duplicates,
    load_predictions,
    load_frozen_lesion_split,
    split_design_calibration,
    subset_rows,
)
from .power_analysis import power_precision_sensitivity
from .view_count_analysis import (
    build_view_count_table,
    paired_view_count_correlation_bootstrap,
    spearman_summary,
)


def _resolve_split_table(
    lesion_table: pd.DataFrame,
    split_file: str | Path | None,
) -> tuple[pd.DataFrame, str]:
    if split_file is not None:
        return load_frozen_lesion_split(split_file, lesion_table), "frozen_split_file"
    return split_design_calibration(lesion_table), "generated"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--predictions", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument(
        "--split-file",
        default=None,
        help="Reuse an immutable lesion_split.csv; assignments are validated and never regenerated.",
    )
    parser.add_argument("--image-root", default=None)
    parser.add_argument("--power-simulations", type=int, default=250)
    parser.add_argument("--power-bootstraps", type=int, default=250)
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    frame = load_predictions(args.predictions)
    deduped, duplicate_audit, duplicate_rows = collapse_exact_duplicates(
        frame, image_root=args.image_root
    )
    lesion_table = build_lesion_table(deduped)
    split_table, split_mode = _resolve_split_table(lesion_table, args.split_file)

    duplicate_rows.to_csv(output_dir / "duplicate_rows.csv", index=False)
    split_table.to_csv(output_dir / "lesion_split.csv", index=False)

    design_ids = split_table.loc[
        split_table["analysis_split"] == "risk_design", "lesion_group"
    ]
    design_frame = subset_rows(deduped, design_ids)
    design_multi = design_frame[
        design_frame["lesion_group"].isin(
            split_table.loc[
                (split_table["analysis_split"] == "risk_design")
                & (split_table["multi_view"]),
                "lesion_group",
            ]
        )
    ].copy()
    records = build_lesion_records(design_multi)

    methods = [
        ("mean_probability", None),
        ("mean_score", None),
        ("logmeanexp", GLOBAL_LME_TAU),
        ("pairrisk", None),
        ("max_score", None),
    ]
    fold_tables = []
    lesion_tables = []
    for method, tau in methods:
        folds, lesions = cross_fitted_method(
            records,
            method=method,
            tau=tau,
            alpha=PRIMARY_ALPHA,
            seed=RANDOM_SEED,
        )
        fold_tables.append(folds)
        lesion_tables.append(lesions)
    fold_results = pd.concat(fold_tables, ignore_index=True)
    lesion_results = pd.concat(lesion_tables, ignore_index=True)
    fold_results.to_csv(output_dir / "design_fold_metrics.csv", index=False)
    lesion_results.to_csv(output_dir / "design_lesion_metrics.csv", index=False)
    pd.DataFrame(
        [
            {
                "tau": GLOBAL_LME_TAU,
                "selected": True,
                "selection_scope": "globally_frozen_protocol_value",
                "selected_in_this_run": False,
            }
        ]
    ).to_csv(output_dir / "lme_temperature_selection.csv", index=False)

    nested_folds, nested_lesions, nested_tau = nested_lme_cross_fitted(
        records,
        alpha=PRIMARY_ALPHA,
        seed=RANDOM_SEED,
    )
    nested_folds.to_csv(output_dir / "nested_lme_fold_metrics.csv", index=False)
    nested_tau.to_csv(output_dir / "nested_lme_selected_tau.csv", index=False)
    nested_comparison_input = pd.concat(
        [
            lesion_results.loc[lesion_results["method"] == "pairrisk"],
            nested_lesions,
        ],
        ignore_index=True,
    )
    nested_bootstrap = paired_bootstrap_differences(
        nested_comparison_input,
        comparisons=(("pairrisk", "nested_logmeanexp"),),
        replicates=2000,
        seed=RANDOM_SEED,
    )
    nested_bootstrap.to_csv(
        output_dir / "nested_lme_vs_pairrisk_bootstrap.csv", index=False
    )

    bootstrap = paired_bootstrap_differences(
        lesion_results,
        comparisons=(
            ("pairrisk", "max_score"),
            ("pairrisk", "mean_probability"),
            ("pairrisk", "mean_score"),
            ("pairrisk", "logmeanexp"),
        ),
        replicates=2000,
        seed=RANDOM_SEED,
    )
    bootstrap.to_csv(output_dir / "design_paired_bootstrap.csv", index=False)

    pivot = lesion_results.pivot(index="lesion_group", columns="method", values="set_size")
    paired = (pivot["pairrisk"] - pivot["max_score"]).dropna().to_numpy(dtype=float)
    max_mean = float(pivot["max_score"].mean())
    power = power_precision_sensitivity(
        paired,
        reference_set_size=max_mean,
        simulations=args.power_simulations,
        bootstrap_replicates=args.power_bootstraps,
        seed=RANDOM_SEED,
    )
    power.to_csv(output_dir / "power_precision_sensitivity.csv", index=False)

    view_count_table = build_view_count_table(records, lme_tau=GLOBAL_LME_TAU)
    view_count_table.to_csv(output_dir / "design_view_count_analysis.csv", index=False)
    spearman_summary(view_count_table).to_csv(
        output_dir / "design_view_count_spearman.csv", index=False
    )
    paired_view_count_correlation_bootstrap(
        view_count_table,
        replicates=2000,
        seed=RANDOM_SEED,
    ).to_csv(output_dir / "view_count_correlation_bootstrap.csv", index=False)
    (
        view_count_table.groupby("view_bin", observed=True)
        .agg(
            n_lesions=("lesion_group", "size"),
            mean_entropy=("average_entropy", "mean"),
            mean_error_fraction=("view_error_fraction", "mean"),
            mean_disagreement=("pairwise_top_disagreement", "mean"),
            mean_true_score_mean=("true_score_mean_score", "mean"),
            mean_true_score_lme=("true_score_logmeanexp", "mean"),
            mean_true_score_pairrisk=("true_score_pairrisk", "mean"),
            mean_true_score_max=("true_score_max", "mean"),
        )
        .reset_index()
        .to_csv(output_dir / "design_view_bin_summary.csv", index=False)
    )

    view_counts = (
        split_table.groupby(["analysis_split", "label_name", "view_bin"], observed=True)
        .size()
        .rename("n_lesions")
        .reset_index()
    )
    view_counts.to_csv(output_dir / "split_stratum_counts.csv", index=False)

    manifest = {
        "status": "initial_implementation_complete",
        "random_seed": RANDOM_SEED,
        "primary_alpha": PRIMARY_ALPHA,
        "global_lme_tau": GLOBAL_LME_TAU,
        "selected_lme_tau": GLOBAL_LME_TAU,
        "global_lme_tau_frozen": True,
        "nested_lme_outer_folds": 5,
        "nested_lme_tau_grid": [0.02, 0.05, 0.10, 0.20, 0.50, 1.00],
        "split_mode": split_mode,
        "split_file": str(Path(args.split_file).resolve()) if args.split_file else None,
        "duplicate_audit": asdict(duplicate_audit),
        "n_images_after_deduplication": int(len(deduped)),
        "n_lesions": int(len(split_table)),
        "n_multi_view_lesions": int(split_table["multi_view"].sum()),
        "n_design_lesions": int((split_table["analysis_split"] == "risk_design").sum()),
        "n_design_multi_view_lesions": int(len(records)),
        "n_calibration_lesions": int((split_table["analysis_split"] == "risk_calibration").sum()),
        "power_planning_target_sizes": [350, 493, 650],
        "development_derived_planning_estimate": 493,
        "development_derived_planning_estimate_is_observed_test_count": False,
        "final_test_accessed": False,
        "notes": [
            "Image-byte duplicate hashing is performed only when --image-root is supplied and files are accessible.",
            "All design comparisons are cross-fitted within risk_design and are not final-test results.",
            "The 493-lesion scenario is a development-derived planning estimate, not an observed final-test lesion count.",
            "Nested LME tau selection is design-stage evaluation only and does not alter the globally frozen tau of 0.05.",
            "Classwise, view-bin, and diversity analyses are descriptive only.",
        ],
    }
    (output_dir / "initial_implementation_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
