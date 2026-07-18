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
