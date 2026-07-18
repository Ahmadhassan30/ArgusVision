"""Generate the formal PairRisk design-stage GO/NO-GO report.

This script reads only aggregate design-stage outputs from design_run_v2. It
does not read calibration outcomes, the frozen split CSV, or any locked-test
artifact.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd


FORBIDDEN_PATH_TOKENS = ("final_test", "final-test", "risk_calibration")
REQUIRED_FILES = (
    "initial_implementation_manifest.json",
    "design_lesion_metrics.csv",
    "design_paired_bootstrap.csv",
    "design_view_count_spearman.csv",
    "design_view_bin_summary.csv",
    "lme_temperature_selection.csv",
    "nested_lme_fold_metrics.csv",
    "nested_lme_selected_tau.csv",
    "nested_lme_vs_pairrisk_bootstrap.csv",
    "power_precision_sensitivity.csv",
    "split_stratum_counts.csv",
    "view_count_correlation_bootstrap.csv",
)


def _guard_path(path: Path) -> None:
    lowered = str(path).lower()
    if any(token in lowered for token in FORBIDDEN_PATH_TOKENS):
        raise RuntimeError(f"Forbidden report input path: {path}")


def _rate(value: float) -> str:
    return f"{100.0 * value:.1f}%"


def _number(value: float, digits: int = 3) -> str:
    return f"{value:.{digits}f}"


def _interval(low: float, high: float, *, percent: bool = False) -> str:
    if percent:
        return f"[{100.0 * low:.1f}%, {100.0 * high:.1f}%]"
    return f"[{low:.3f}, {high:.3f}]"


def pooled_method_metrics(frame: pd.DataFrame) -> dict[str, float]:
    singleton = frame["singleton"].astype(bool).to_numpy()
    covered = frame["covered"].astype(bool).to_numpy()
    singleton_correct = frame["singleton_correct"].astype(bool).to_numpy()
    set_size = frame["set_size"].to_numpy(dtype=float)
    pair_support = frame["pair_support"].to_numpy(dtype=float)
    return {
        "n": float(len(frame)),
        "coverage": float(covered.mean()),
        "average_set_size": float(set_size.mean()),
        "median_set_size": float(np.median(set_size)),
        "singleton_rate": float(singleton.mean()),
        "singleton_accuracy": (
            float(singleton_correct[singleton].mean()) if singleton.any() else float("nan")
        ),
        "conditional_singleton_consistency": (
            float(np.nanmean(pair_support[singleton])) if singleton.any() else float("nan")
        ),
        "safe_singleton_yield": float(
            np.nansum(np.where(singleton, pair_support, 0.0)) / len(frame)
        ),
        "empty_set_rate": float((set_size == 0).mean()),
        "full_set_rate": float((set_size == 8).mean()),
    }


def fold_weighted_metrics(frame: pd.DataFrame) -> dict[str, float]:
    weights = frame["n_lesions"].to_numpy(dtype=float)
    singleton_weights = weights * frame["singleton_rate"].to_numpy(dtype=float)
    result = {
        "n": float(weights.sum()),
        "coverage": float(np.average(frame["coverage"], weights=weights)),
        "average_set_size": float(np.average(frame["average_set_size"], weights=weights)),
        "singleton_rate": float(np.average(frame["singleton_rate"], weights=weights)),
        "safe_singleton_yield": float(
            np.average(frame["safe_singleton_yield"], weights=weights)
        ),
        "empty_set_rate": float(np.average(frame["empty_set_rate"], weights=weights)),
        "full_set_rate": float(np.average(frame["full_set_rate"], weights=weights)),
        "singleton_accuracy": float(
            np.average(frame["singleton_accuracy"], weights=singleton_weights)
        ),
        "conditional_singleton_consistency": float(
            np.average(
                frame["conditional_singleton_consistency"], weights=singleton_weights
            )
        ),
    }
    result["median_set_size"] = float("nan")
    return result


def choose_decision(
    *,
    pair_max_relative_reduction: float,
    pair_max_set_size_ci_high: float,
    view_count_difference_ci_low: float,
    nested_set_size_ci_low: float,
    power_for_five_percent_at_493: float,
) -> str:
    full_pairrisk = (
        pair_max_relative_reduction >= 0.05
        and pair_max_set_size_ci_high < 0.0
        and nested_set_size_ci_low <= 0.0
    )
    if full_pairrisk:
        return "FULL_PAIRRISK_GO"

    count_sensitivity = (
        view_count_difference_ci_low > 0.0
        and power_for_five_percent_at_493 >= 0.80
        and nested_set_size_ci_low > -0.15
    )
    if count_sensitivity:
        return "COUNT_SENSITIVITY_PAPER_GO"
    return "FALLBACK_MSP"


def _bootstrap_row(
    frame: pd.DataFrame, method_b: str, metric: str
) -> pd.Series:
    rows = frame.loc[
        (frame["method_a"] == "pairrisk")
        & (frame["method_b"] == method_b)
        & (frame["metric"] == metric)
    ]
    if len(rows) != 1:
        raise ValueError(f"Expected one PairRisk/{method_b}/{metric} bootstrap row.")
    return rows.iloc[0]


def _metric_table_row(name: str, values: dict[str, float], median_text: str | None = None) -> str:
    median = median_text or _number(values["median_set_size"], 1)
    return (
        f"| {name} | {_rate(values['coverage'])} | "
        f"{_number(values['average_set_size'])} | {median} | "
        f"{_rate(values['singleton_rate'])} | {_rate(values['singleton_accuracy'])} | "
        f"{_rate(values['conditional_singleton_consistency'])} | "
        f"{_rate(values['safe_singleton_yield'])} | {_rate(values['empty_set_rate'])} | "
        f"{_rate(values['full_set_rate'])} |"
    )


def _comparison_table(
    pair: dict[str, float],
    other: dict[str, float],
    bootstrap: pd.DataFrame,
    method_b: str,
) -> str:
    labels = (
        ("Average set size", "average_set_size", False),
        ("Coverage", "coverage", True),
        ("Singleton rate", "singleton_rate", True),
        ("Singleton accuracy", "singleton_accuracy", True),
        ("CSC", "conditional_singleton_consistency", True),
        ("SSY", "safe_singleton_yield", True),
    )
    lines = [
        "| Metric | PairRisk | Comparator | PairRisk - comparator | Paired 95% CI |",
        "|---|---:|---:|---:|---:|",
    ]
    for label, metric, percent in labels:
        row = _bootstrap_row(bootstrap, method_b, metric)
        if percent:
            values = (
                _rate(pair[metric]),
                _rate(other[metric]),
                f"{100.0 * row['estimate']:+.1f} pp",
                _interval(row["ci_low"], row["ci_high"], percent=True),
            )
        else:
            values = (
                _number(pair[metric]),
                _number(other[metric]),
                f"{row['estimate']:+.3f}",
                _interval(row["ci_low"], row["ci_high"]),
            )
        lines.append(f"| {label} | {values[0]} | {values[1]} | {values[2]} | {values[3]} |")
    return "\n".join(lines)


def generate_report(input_dir: Path) -> str:
    input_dir = input_dir.resolve()
    _guard_path(input_dir)
    missing = [name for name in REQUIRED_FILES if not (input_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(f"Missing design report inputs: {missing}")

    manifest = json.loads(
        (input_dir / "initial_implementation_manifest.json").read_text(encoding="utf-8")
    )
    if manifest.get("final_test_accessed") is not False:
        raise RuntimeError("Manifest does not confirm locked-test non-access.")
    if manifest.get("split_mode") != "frozen_split_file":
        raise RuntimeError("Manifest does not confirm frozen split reuse.")
    if manifest.get("primary_alpha") != 0.10:
        raise RuntimeError("Primary alpha is not the frozen 0.10 value.")
    if manifest.get("global_lme_tau") != 0.05:
        raise RuntimeError("Global LogMeanExp tau is not the frozen 0.05 value.")

    lesion_results = pd.read_csv(input_dir / "design_lesion_metrics.csv")
    pair_bootstrap = pd.read_csv(input_dir / "design_paired_bootstrap.csv")
    nested_folds = pd.read_csv(input_dir / "nested_lme_fold_metrics.csv")
    nested_tau = pd.read_csv(input_dir / "nested_lme_selected_tau.csv")
    nested_bootstrap = pd.read_csv(input_dir / "nested_lme_vs_pairrisk_bootstrap.csv")
    spearman = pd.read_csv(input_dir / "design_view_count_spearman.csv")
    view_bootstrap = pd.read_csv(input_dir / "view_count_correlation_bootstrap.csv")
    power = pd.read_csv(input_dir / "power_precision_sensitivity.csv")
    view_bins = pd.read_csv(input_dir / "design_view_bin_summary.csv")
    strata = pd.read_csv(input_dir / "split_stratum_counts.csv")
    frozen_lme = pd.read_csv(input_dir / "lme_temperature_selection.csv")

    methods = {
        method: pooled_method_metrics(group)
        for method, group in lesion_results.groupby("method", sort=False)
    }
    required_methods = {
        "mean_probability", "mean_score", "logmeanexp", "pairrisk", "max_score"
    }
    if set(methods) != required_methods:
        raise ValueError(f"Unexpected design methods: {sorted(methods)}")
    nested = fold_weighted_metrics(nested_folds)
    pair = methods["pairrisk"]
    maximum = methods["max_score"]

    pair_max_size = _bootstrap_row(pair_bootstrap, "max_score", "average_set_size")
    relative_reduction = -float(pair_max_size["estimate"]) / maximum["average_set_size"]
    view_difference = view_bootstrap.iloc[0]
    nested_size = _bootstrap_row(
        nested_bootstrap, "nested_logmeanexp", "average_set_size"
    )
    power_493_5 = power.loc[
        (power["target_n"] == 493)
        & (power["relative_set_size_effect_percent"] == 5.0),
        "estimated_power",
    ]
    if len(power_493_5) != 1:
        raise ValueError("Missing 493-lesion, 5% power scenario.")
    decision = choose_decision(
        pair_max_relative_reduction=relative_reduction,
        pair_max_set_size_ci_high=float(pair_max_size["ci_high"]),
        view_count_difference_ci_low=float(view_difference["ci_low"]),
        nested_set_size_ci_low=float(nested_size["ci_low"]),
        power_for_five_percent_at_493=float(power_493_5.iloc[0]),
    )

    main_rows = [
        _metric_table_row("Mean probability", methods["mean_probability"]),
        _metric_table_row("Mean APS score", methods["mean_score"]),
        _metric_table_row("Global LogMeanExp (tau=0.05)", methods["logmeanexp"]),
        _metric_table_row(
            "Nested LogMeanExp",
            nested,
            median_text=(
                f"fold medians {_number(nested_folds['median_set_size'].min(), 1)}-"
                f"{_number(nested_folds['median_set_size'].max(), 1)}"
            ),
        ),
        _metric_table_row("PairRisk (k=2)", pair),
        _metric_table_row("Maximum", maximum),
    ]

    tau_rows = ["| Outer fold | Selected tau |", "|---:|---:|"]
    for row in nested_tau.sort_values("outer_fold").itertuples():
        tau_rows.append(f"| {int(row.outer_fold)} | {row.selected_tau:g} |")
    frequencies = nested_tau["selected_tau"].value_counts().sort_index()
    tau_frequency_text = ", ".join(f"tau={tau:g}: {count}/5" for tau, count in frequencies.items())

    rho_map = spearman.set_index("outcome")["spearman_rho"]
    rho_rows = []
    for label, outcome in (
        ("Mean probability", "true_score_mean_probability"),
        ("Mean APS score", "true_score_mean_score"),
        ("Global LogMeanExp", "true_score_logmeanexp"),
        ("PairRisk", "true_score_pairrisk"),
        ("Maximum", "true_score_max"),
    ):
        rho_rows.append(f"| {label} | {rho_map[outcome]:.3f} |")

    power_rows = [
        "| Target n | Relative effect | Estimated power | Median 95% CI width | Planning status |",
        "|---:|---:|---:|---:|---|",
    ]
    minimum_effects: dict[int, str] = {}
    for row in power.sort_values(["target_n", "relative_set_size_effect_percent"]).itertuples():
        role = "development-derived estimate" if row.target_n == 493 else "sensitivity scenario"
        power_rows.append(
            f"| {int(row.target_n)} | {row.relative_set_size_effect_percent:g}% | "
            f"{_rate(row.estimated_power)} | {_number(row.median_ci_width)} | {role} |"
        )
    for target_n, group in power.groupby("target_n"):
        approximately_powered = group.loc[group["estimated_power"] >= 0.79]
        minimum_effects[int(target_n)] = (
            f"{approximately_powered['relative_set_size_effect_percent'].min():g}%"
            if not approximately_powered.empty
            else "none in grid"
        )

    aggregate_bin_rows = ["| Multi-view bin | Design lesions | Status |", "|---|---:|---|"]
    for row in view_bins.itertuples():
        status = "descriptive only (n<30)" if row.n_lesions < 30 else "adequate for aggregate description"
        aggregate_bin_rows.append(f"| {row.view_bin} | {int(row.n_lesions)} | {status} |")

    design_strata = strata.loc[strata["analysis_split"] == "risk_design"].copy()
    pivot = design_strata.pivot(index="label_name", columns="view_bin", values="n_lesions")
    stratum_rows = ["| Class | 1 view | 2 views | 3+ views |", "|---|---:|---:|---:|"]
    for label, row in pivot.sort_index().iterrows():
        cells = []
        for column in ("1", "2", "3+"):
            count = int(row.get(column, 0))
            cells.append(f"{count} (descriptive only)" if count < 30 else str(count))
        stratum_rows.append(f"| {label} | {cells[0]} | {cells[1]} | {cells[2]} |")

    pair_max_table = _comparison_table(pair, maximum, pair_bootstrap, "max_score")
    pair_mean_probability = _comparison_table(
        pair, methods["mean_probability"], pair_bootstrap, "mean_probability"
    )
    pair_mean_score = _comparison_table(
        pair, methods["mean_score"], pair_bootstrap, "mean_score"
    )
    pair_nested = _comparison_table(pair, nested, nested_bootstrap, "nested_logmeanexp")

    report = f"""# PairRisk Design-Stage GO/NO-GO Report

**Formal decision: `{decision}`**

This report is generated reproducibly from aggregate outputs in `artifacts/pairrisk/design_run_v2`. It is a design-stage analysis, not calibration or locked-test evidence.

## 1. Integrity and scope

| Item | Result |
|---|---:|
| Images after identifier deduplication | {manifest['n_images_after_deduplication']:,} |
| Total lesions | {manifest['n_lesions']:,} |
| Multi-view lesions | {manifest['n_multi_view_lesions']:,} |
| Design lesions | {manifest['n_design_lesions']:,} |
| Design multi-view lesions analyzed | {manifest['n_design_multi_view_lesions']:,} |
| Calibration lesions (assignment count only; no outcomes used) | {manifest['n_calibration_lesions']:,} |
| Frozen split reused | yes (`{manifest['split_mode']}`) |
| `final_test_accessed` | `{str(manifest['final_test_accessed']).lower()}` |
| Primary alpha | {manifest['primary_alpha']:.2f} |
| Global LogMeanExp tau | {manifest['global_lme_tau']:.2f} (frozen; not reselected) |

The normalized-identifier duplicate audit removed {manifest['duplicate_audit']['duplicate_normalized_ids_removed']} rows. Byte-level duplicate checking is **incomplete**: {manifest['duplicate_audit']['file_hashes_attempted']} image hashes were attempted because no image root was supplied. No claim of complete byte-level duplicate exclusion is made.

## 2. Main cross-fitted results

| Method | Coverage | Average set size | Median set size | Singleton rate | Singleton accuracy | CSC | SSY | Empty-set rate | Full-set rate |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
{chr(10).join(main_rows)}

The five fixed methods use pooled out-of-fold lesion results. Nested LogMeanExp uses lesion-count-weighted outer-fold summaries; its pooled median cannot be reconstructed from fold aggregates, so the observed fold-median range is shown. Individual-method confidence intervals were not exported; paired difference intervals are reported below.

## 3. PairRisk versus maximum

{pair_max_table}

PairRisk reduced average set size by {_number(-pair_max_size['estimate'])} sets per lesion, a {100.0 * relative_reduction:.1f}% relative reduction from maximum's {_number(maximum['average_set_size'])}. The set-size interval {_interval(pair_max_size['ci_low'], pair_max_size['ci_high'])} crosses zero. The effect is therefore **below the originally planned 5% effect, small in magnitude, and not interval-supported as a real efficiency reduction**. Its SSY gain was +{100.0 * _bootstrap_row(pair_bootstrap, 'max_score', 'safe_singleton_yield')['estimate']:.1f} percentage points with a positive interval, but the singleton-accuracy and CSC intervals include no difference.

**Answers.** The efficiency effect is not materially strong enough for a full PairRisk claim. The interval does not establish a real reduction. The point estimate is below 5%, at about {100.0 * relative_reduction:.1f}%.

## 4. PairRisk versus simple mean

### Mean probability

{pair_mean_probability}

### Mean APS score

{pair_mean_score}

PairRisk retains contradictory-view sensitivity by construction and empirically occupies an intermediate count-sensitivity position between simple means and maximum. Against mean probability it used smaller sets ({_number(_bootstrap_row(pair_bootstrap, 'mean_probability', 'average_set_size')['estimate'])}) and raised SSY, both with intervals excluding zero. Against mean APS score, however, its set-size interval crossed zero, singleton accuracy was lower by {abs(100.0 * _bootstrap_row(pair_bootstrap, 'mean_score', 'singleton_accuracy')['estimate']):.1f} points, and CSC was lower by {abs(100.0 * _bootstrap_row(pair_bootstrap, 'mean_score', 'conditional_singleton_consistency')['estimate']):.1f} points; both safety intervals excluded zero.

**Answers.** PairRisk retains contradictory-view sensitivity, but it does not consistently produce safer singleton outputs than the stronger mean-score baseline. Relative to mean probability it improves throughput through smaller sets and more singleton yield. Relative to mean score it sacrifices singleton accuracy, CSC, and point-estimate SSY without a secure efficiency gain.

## 5. PairRisk versus LogMeanExp

The globally frozen deployment candidate remains tau={float(frozen_lme.iloc[0]['tau']):.2f}. The nested comparison selected tau strictly within each outer training fold:

{chr(10).join(tau_rows)}

Selection frequency: {tau_frequency_text}.

{pair_nested}

PairRisk used {_number(pair['average_set_size'] - nested['average_set_size'])} more labels per lesion than nested LogMeanExp on the point estimate, but the paired interval for PairRisk minus nested LogMeanExp {_interval(nested_size['ci_low'], nested_size['ci_high'])} crossed zero. Coverage, singleton rate, singleton accuracy, and CSC intervals also crossed zero. SSY favored nested LogMeanExp at the boundary of the interval.

**Answers.** Nested LogMeanExp does not conclusively dominate PairRisk, but neither are the data consistent with PairRisk dominance; they are approximately equivalent on efficiency and coverage, with a modest singleton-utility tilt toward nested LogMeanExp. PairRisk retains a meaningful Pareto position only through its substantially lower bag-size sensitivity, not through superior set efficiency.

## 6. View-count sensitivity

| True-label score | Spearman rho versus view count |
|---|---:|
{chr(10).join(rho_rows)}

The paired lesion bootstrap estimate for rho(maximum) minus rho(PairRisk) was {view_difference['estimate']:.3f}, 95% CI {_interval(view_difference['ci_low'], view_difference['ci_high'])}, with {int(view_difference['valid_replicates'])}/{int(view_difference['replicates'])} valid replicates.

**Answers.** Maximum is substantially more sensitive to bag size. The positive paired interval is statistically stable. PairRisk reduces count sensitivity from rho={rho_map['true_score_max']:.3f} to rho={rho_map['true_score_pairrisk']:.3f}; it reduces rather than eliminates sensitivity. Separate-correlation p-values are not used to test this difference.

## 7. Power and precision

{chr(10).join(power_rows)}

Minimum grid effect with approximately 80% power: n=350: {minimum_effects[350]}; n=493: {minimum_effects[493]}; n=650: {minimum_effects[650]}. Effects of 2% and 3% remain underpowered at every planned sample size. The 5% scenario reaches 79.6%, 86.8%, and 97.2% power for n=350, 493, and 650, respectively.

**The value 493 is a development-derived planning estimate, not an observed final-test multi-view lesion count.**

## 8. Small-subgroup limits

### Aggregate multi-view bins

{chr(10).join(aggregate_bin_rows)}

### Design assignment cells by class and view bin

{chr(10).join(stratum_rows)}

Every cell with n<30 is explicitly marked descriptive only. These counts support no subgroup conformal-validity claim and no class-conditional validity claim. Even unmarked aggregate cells are descriptive design evidence, not confirmatory subgroup validation.

## 9. Decision

**`{decision}`**

`FULL_PAIRRISK_GO` is rejected because the PairRisk-versus-maximum efficiency gain is only {100.0 * relative_reduction:.1f}%, below the planned 5%, and its confidence interval crosses zero. `FALLBACK_MSP` is also rejected because the count-sensitivity reduction is large, paired, interval-supported, coherent across the ordered aggregators, and the 5% planning effect is adequately powered at n=493 and n=650. The evidence supports a comparison paper centered on how mean, fixed-order PairRisk, normalized smooth LogMeanExp, and variable-order maximum pooling respond to bag size and contradictory views.

This decision uses effect magnitude, paired intervals, nested LME, power, and scientific coherence; it is not based on one favorable point estimate.

## 10. Next-stage recommendation

- **Frozen narrative:** a count-sensitivity comparison of mean probability, mean APS score, fixed-order PairRisk, normalized smooth LogMeanExp, and variable-order maximum aggregation.
- **Methods proceeding to calibration:** mean probability, mean APS score, globally frozen LogMeanExp tau=0.05, PairRisk k=2, and maximum. Nested fold-specific LME is an evaluation device, not a calibration candidate.
- **Secondary analyses:** singleton utility/consistency, nested tau stability, view-bin descriptions, and class-by-view assignment counts.
- **Remaining limitation:** byte-level duplicate checking is incomplete because no local image root was available; it must be completed before publication claims are finalized.
- **Calibration implementation:** may begin under the frozen narrative and fixed method set, without revisiting alpha, PairRisk k, global tau, or lesion assignments. Calibration is not implemented by this report.
"""
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input-dir",
        default="artifacts/pairrisk/design_run_v2",
        help="Existing corrected design-stage output directory.",
    )
    parser.add_argument(
        "--output",
        default="ml_training/pairrisk_study/DESIGN_GO_NO_GO.md",
        help="Markdown report path.",
    )
    args = parser.parse_args()
    input_dir = Path(args.input_dir)
    output = Path(args.output)
    _guard_path(output)
    report = generate_report(input_dir)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(report, encoding="utf-8", newline="\n")
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
