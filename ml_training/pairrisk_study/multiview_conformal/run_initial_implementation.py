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
from .constants import PRIMARY_ALPHA, RANDOM_SEED
from .design_analysis import cross_fitted_method, select_lme_tau
from .evaluate import build_lesion_records
from .lesion_bags import (
    build_lesion_table,
    collapse_exact_duplicates,
    load_predictions,
    split_design_calibration,
    subset_rows,
)
from .power_analysis import empirical_bootstrap_power
from .view_count_analysis import build_view_count_table, spearman_summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--predictions", required=True)
    parser.add_argument("--output-dir", required=True)
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
    split_table = split_design_calibration(lesion_table)

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

    selected_tau, tau_table = select_lme_tau(records)
    tau_table.to_csv(output_dir / "lme_temperature_selection.csv", index=False)

    methods = [
        ("mean_probability", None),
        ("mean_score", None),
        ("logmeanexp", selected_tau),
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
    target_effects = (
        -0.02 * max_mean,
        -0.05 * max_mean,
        -0.10 * max_mean,
    )
    # Estimate final-test multi-view lesion count from the development ratio and
    # known final-test image count only as a planning approximation.
    expected_target_n = max(100, int(round(2197 / deduped.groupby("lesion_group").size().mean() * split_table["multi_view"].mean())))
    power = empirical_bootstrap_power(
        paired,
        target_n=expected_target_n,
        target_effects=target_effects,
        simulations=args.power_simulations,
        bootstrap_replicates=args.power_bootstraps,
        seed=RANDOM_SEED,
    )
    pd.DataFrame([asdict(row) for row in power]).to_csv(
        output_dir / "power_precision_simulation.csv", index=False
    )

    view_count_table = build_view_count_table(records, lme_tau=selected_tau)
    view_count_table.to_csv(output_dir / "design_view_count_analysis.csv", index=False)
    spearman_summary(view_count_table).to_csv(
        output_dir / "design_view_count_spearman.csv", index=False
    )
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
        "selected_lme_tau": selected_tau,
        "duplicate_audit": asdict(duplicate_audit),
        "n_images_after_deduplication": int(len(deduped)),
        "n_lesions": int(len(split_table)),
        "n_multi_view_lesions": int(split_table["multi_view"].sum()),
        "n_design_lesions": int((split_table["analysis_split"] == "risk_design").sum()),
        "n_design_multi_view_lesions": int(len(records)),
        "n_calibration_lesions": int((split_table["analysis_split"] == "risk_calibration").sum()),
        "expected_final_test_multi_view_n_for_power_planning": expected_target_n,
        "final_test_accessed": False,
        "notes": [
            "Image-byte duplicate hashing is performed only when --image-root is supplied and files are accessible.",
            "All design comparisons are cross-fitted within risk_design and are not final-test results.",
            "Classwise, view-bin, and diversity analyses are descriptive only.",
        ],
    }
    (output_dir / "initial_implementation_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
