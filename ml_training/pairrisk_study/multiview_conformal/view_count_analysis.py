"""Descriptive view-count and model-estimated difficulty analysis."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from .evaluate import LesionRecord, score_record


def _entropy(probabilities: np.ndarray) -> np.ndarray:
    clipped = np.clip(probabilities, 1e-15, 1.0)
    return -np.sum(clipped * np.log(clipped), axis=1)


def _pairwise_top_disagreement(top_classes: np.ndarray) -> float:
    n = len(top_classes)
    if n < 2:
        return float("nan")
    counts = np.bincount(top_classes)
    agreeing_pairs = np.sum(counts * (counts - 1) / 2.0)
    total_pairs = n * (n - 1) / 2.0
    return float(1.0 - agreeing_pairs / total_pairs)


def build_view_count_table(records: list[LesionRecord], *, lme_tau: float) -> pd.DataFrame:
    rows: list[dict[str, object]] = []
    for record in records:
        true = record.label
        scores = {
            "true_score_mean_probability": score_record(record, "mean_probability")[true],
            "true_score_mean_score": score_record(record, "mean_score")[true],
            "true_score_logmeanexp": score_record(record, "logmeanexp", tau=lme_tau)[true],
            "true_score_pairrisk": score_record(record, "pairrisk")[true],
            "true_score_max": score_record(record, "max_score")[true],
        }
        per_view_pred = np.argmax(record.view_probabilities, axis=1)
        rows.append(
            {
                "lesion_group": record.lesion_group,
                "label": record.label,
                "label_name": record.label_name,
                "n_views": record.n_views,
                "view_bin": "2" if record.n_views == 2 else ("3" if record.n_views == 3 else "4+"),
                "log2_n_views": math.log2(record.n_views),
                "average_entropy": float(_entropy(record.view_probabilities).mean()),
                "view_error_fraction": float(np.mean(per_view_pred != record.label)),
                "pairwise_top_disagreement": _pairwise_top_disagreement(per_view_pred),
                **scores,
            }
        )
    return pd.DataFrame(rows)


def spearman_summary(table: pd.DataFrame) -> pd.DataFrame:
    outcomes = [
        "average_entropy",
        "view_error_fraction",
        "pairwise_top_disagreement",
        "true_score_mean_probability",
        "true_score_mean_score",
        "true_score_logmeanexp",
        "true_score_pairrisk",
        "true_score_max",
    ]
    rows = []
    x = table["log2_n_views"].to_numpy(dtype=float)
    for outcome in outcomes:
        y = table[outcome].to_numpy(dtype=float)
        finite = np.isfinite(x) & np.isfinite(y)
        rho, p_value = spearmanr(x[finite], y[finite])
        rows.append(
            {
                "outcome": outcome,
                "n_lesions": int(finite.sum()),
                "spearman_rho": float(rho),
                "p_value_descriptive": float(p_value),
            }
        )
    return pd.DataFrame(rows)


def paired_view_count_correlation_bootstrap(
    table: pd.DataFrame,
    *,
    replicates: int = 2000,
    seed: int = 2026,
) -> pd.DataFrame:
    """Bootstrap rho(max score, views) minus rho(PairRisk score, views)."""
    required = {"lesion_group", "n_views", "true_score_max", "true_score_pairrisk"}
    missing = required - set(table.columns)
    if missing:
        raise ValueError(f"Missing view-count bootstrap columns: {sorted(missing)}")
    if table["lesion_group"].duplicated().any():
        raise ValueError("View-count bootstrap requires exactly one row per lesion.")
    if replicates < 100:
        raise ValueError("Use at least 100 bootstrap replicates.")

    frame = table.loc[:, sorted(required)].copy()
    finite = np.isfinite(
        frame[["n_views", "true_score_max", "true_score_pairrisk"]].to_numpy(dtype=float)
    ).all(axis=1)
    frame = frame.loc[finite].reset_index(drop=True)
    if len(frame) < 3:
        raise ValueError("At least three finite lesions are required for correlation bootstrap.")

    def correlation(column: str, indices: np.ndarray | None = None) -> float:
        sampled = frame if indices is None else frame.iloc[indices]
        x = sampled["n_views"].to_numpy(dtype=float)
        y = sampled[column].to_numpy(dtype=float)
        if np.unique(x).size < 2 or np.unique(y).size < 2:
            return float("nan")
        return float(spearmanr(x, y).statistic)

    rho_max = correlation("true_score_max")
    rho_pairrisk = correlation("true_score_pairrisk")
    estimate = rho_max - rho_pairrisk

    rng = np.random.default_rng(seed)
    differences = np.empty(replicates, dtype=float)
    for replicate in range(replicates):
        indices = rng.integers(0, len(frame), size=len(frame))
        differences[replicate] = (
            correlation("true_score_max", indices)
            - correlation("true_score_pairrisk", indices)
        )
    valid = differences[np.isfinite(differences)]
    if valid.size:
        ci_low, ci_high = np.quantile(valid, [0.025, 0.975])
    else:
        ci_low = ci_high = float("nan")

    return pd.DataFrame(
        [
            {
                "comparison": "spearman_rho_max_score_minus_pairrisk_score_vs_view_count",
                "n_lesions": int(len(frame)),
                "rho_max_score_vs_view_count": rho_max,
                "rho_pairrisk_score_vs_view_count": rho_pairrisk,
                "estimate": float(estimate),
                "ci_low": float(ci_low),
                "ci_high": float(ci_high),
                "replicates": int(replicates),
                "valid_replicates": int(valid.size),
                "invalid_replicates": int(replicates - valid.size),
                "seed": int(seed),
                "sampling_unit": "lesion_group",
            }
        ]
    )
