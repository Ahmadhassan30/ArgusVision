"""Deterministic APS scoring and split-conformal calibration."""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray


FloatArray = NDArray[np.float64]
BoolArray = NDArray[np.bool_]


def validate_probabilities(probabilities: ArrayLike, atol: float = 1e-6) -> FloatArray:
    probs = np.asarray(probabilities, dtype=np.float64)
    if probs.ndim != 2:
        raise ValueError(f"Expected a 2-D probability matrix, got {probs.shape}.")
    if not np.isfinite(probs).all():
        raise ValueError("Probability matrix contains NaN or infinity.")
    if (probs < -atol).any():
        raise ValueError("Probability matrix contains negative values.")
    row_sums = probs.sum(axis=1)
    if not np.allclose(row_sums, 1.0, atol=atol, rtol=0.0):
        raise ValueError(
            f"Probability rows must sum to one; max error={np.max(np.abs(row_sums - 1.0)):.3e}."
        )
    return probs


def aps_scores(probabilities: ArrayLike) -> FloatArray:
    """Compute deterministic APS nonconformity for every candidate label.

    Ties are resolved using a stable sort, preserving the frozen class order.
    """
    probs = validate_probabilities(probabilities)
    n_rows, n_classes = probs.shape
    order = np.argsort(-probs, axis=1, kind="stable")
    sorted_probs = np.take_along_axis(probs, order, axis=1)
    cumulative = np.cumsum(sorted_probs, axis=1)

    scores = np.empty_like(cumulative)
    rows = np.arange(n_rows)[:, None]
    scores[rows, order] = cumulative
    return scores


def calibrate_quantile(true_label_scores: ArrayLike, alpha: float) -> float:
    """Finite-sample split-conformal threshold.

    Returns infinity when the requested rank is larger than the number of
    finite calibration scores, which is the conservative finite-sample action.
    """
    scores = np.asarray(true_label_scores, dtype=np.float64).reshape(-1)
    if scores.size == 0:
        raise ValueError("Calibration requires at least one score.")
    if not np.isfinite(scores).all():
        raise ValueError("Calibration scores contain NaN or infinity.")
    if not 0 < alpha < 1:
        raise ValueError("alpha must be in (0, 1).")

    rank = int(math.ceil((scores.size + 1) * (1.0 - alpha)))
    if rank > scores.size:
        return float("inf")
    return float(np.partition(scores, rank - 1)[rank - 1])


def prediction_sets(candidate_scores: ArrayLike, threshold: float) -> BoolArray:
    scores = np.asarray(candidate_scores, dtype=np.float64)
    if scores.ndim != 2:
        raise ValueError("Candidate scores must have shape (n_lesions, n_classes).")
    if np.isnan(scores).any():
        raise ValueError("Candidate scores contain NaN.")
    return scores <= threshold


@dataclass(frozen=True)
class ConformalOutput:
    threshold: float
    sets: BoolArray
