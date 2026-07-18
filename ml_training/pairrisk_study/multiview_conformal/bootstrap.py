"""Paired lesion-level bootstrap utilities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class BootstrapDifference:
    method_a: str
    method_b: str
    metric: str
    estimate: float
    ci_low: float
    ci_high: float
    replicates: int


def _method_metrics(frame: pd.DataFrame) -> dict[str, float]:
    singleton = frame["singleton"].astype(bool).to_numpy()
    covered = frame["covered"].astype(bool).to_numpy()
    set_size = frame["set_size"].to_numpy(dtype=float)
    singleton_correct = frame["singleton_correct"].astype(bool).to_numpy()
    pair_support = frame["pair_support"].to_numpy(dtype=float)

    csc = float(np.nanmean(pair_support[singleton])) if singleton.any() else float("nan")
    singleton_accuracy = (
        float(singleton_correct[singleton].mean()) if singleton.any() else float("nan")
    )
    safe_yield = float(np.nansum(np.where(singleton, pair_support, 0.0)) / len(frame))
    return {
        "coverage": float(covered.mean()),
        "average_set_size": float(set_size.mean()),
        "singleton_rate": float(singleton.mean()),
        "singleton_accuracy": singleton_accuracy,
        "conditional_singleton_consistency": csc,
        "safe_singleton_yield": safe_yield,
    }


def paired_bootstrap_differences(
    lesion_results: pd.DataFrame,
    *,
    comparisons: tuple[tuple[str, str], ...],
    replicates: int = 2000,
    seed: int = 2026,
) -> pd.DataFrame:
    """Bootstrap method A minus method B by resampling whole lesions.

    ``lesion_results`` must contain one row per lesion per method. All methods in
    a comparison must cover the same lesion IDs. Pair terms are never resampled.
    """
    required = {
        "lesion_group",
        "method",
        "covered",
        "set_size",
        "singleton",
        "singleton_correct",
        "pair_support",
    }
    missing = required - set(lesion_results.columns)
    if missing:
        raise ValueError(f"Missing bootstrap columns: {sorted(missing)}")
    if replicates < 100:
        raise ValueError("Use at least 100 bootstrap replicates.")

    rng = np.random.default_rng(seed)
    outputs: list[BootstrapDifference] = []

    for method_a, method_b in comparisons:
        a = lesion_results[lesion_results["method"] == method_a].copy()
        b = lesion_results[lesion_results["method"] == method_b].copy()
        ids_a = set(a["lesion_group"])
        ids_b = set(b["lesion_group"])
        if ids_a != ids_b:
            raise ValueError(f"Methods {method_a} and {method_b} do not share identical lesion IDs.")

        lesion_ids = np.array(sorted(ids_a), dtype=object)
        a = a.set_index("lesion_group").loc[lesion_ids].reset_index()
        b = b.set_index("lesion_group").loc[lesion_ids].reset_index()
        point_a = _method_metrics(a)
        point_b = _method_metrics(b)
        metric_names = tuple(point_a)
        draws = {metric: np.empty(replicates, dtype=float) for metric in metric_names}

        for rep in range(replicates):
            indices = rng.integers(0, len(lesion_ids), size=len(lesion_ids))
            metrics_a = _method_metrics(a.iloc[indices])
            metrics_b = _method_metrics(b.iloc[indices])
            for metric in metric_names:
                draws[metric][rep] = metrics_a[metric] - metrics_b[metric]

        for metric in metric_names:
            values = draws[metric]
            finite = values[np.isfinite(values)]
            if finite.size == 0:
                low = high = float("nan")
            else:
                low, high = np.quantile(finite, [0.025, 0.975])
            outputs.append(
                BootstrapDifference(
                    method_a=method_a,
                    method_b=method_b,
                    metric=metric,
                    estimate=float(point_a[metric] - point_b[metric]),
                    ci_low=float(low),
                    ci_high=float(high),
                    replicates=int(replicates),
                )
            )

    return pd.DataFrame([item.__dict__ for item in outputs])
