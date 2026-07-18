"""Candidate-label score aggregation for variable-size lesion bags.

All functions accept an array with shape ``(n_views, n_classes)`` and return
one candidate-label score vector with shape ``(n_classes,)``.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike, NDArray


FloatArray = NDArray[np.float64]


def _as_score_matrix(scores: ArrayLike) -> FloatArray:
    arr = np.asarray(scores, dtype=np.float64)
    if arr.ndim != 2:
        raise ValueError(f"Expected a 2-D score matrix, got shape {arr.shape}.")
    if arr.shape[0] < 1 or arr.shape[1] < 1:
        raise ValueError("Score matrix must contain at least one view and one class.")
    if not np.isfinite(arr).all():
        raise ValueError("Score matrix contains NaN or infinity.")
    return arr


def mean_scores(scores: ArrayLike) -> FloatArray:
    """Arithmetic mean of per-view candidate-label scores."""
    arr = _as_score_matrix(scores)
    return arr.mean(axis=0)


def max_scores(scores: ArrayLike) -> FloatArray:
    """Full observed-view maximum for each candidate label."""
    arr = _as_score_matrix(scores)
    return arr.max(axis=0)


def pairrisk_scores_bruteforce(scores: ArrayLike) -> FloatArray:
    """PairRisk by explicit unordered-pair enumeration.

    This implementation is intentionally simple and is primarily used as a
    correctness oracle for tests.
    """
    arr = _as_score_matrix(scores)
    n_views = arr.shape[0]
    if n_views < 2:
        raise ValueError("PairRisk requires at least two views.")

    total = np.zeros(arr.shape[1], dtype=np.float64)
    n_pairs = 0
    for i in range(n_views - 1):
        for j in range(i + 1, n_views):
            total += np.maximum(arr[i], arr[j])
            n_pairs += 1
    return total / n_pairs


def pairrisk_scores(scores: ArrayLike) -> FloatArray:
    """Efficient fixed-order PairRisk aggregation.

    For sorted scores ``s_(1) <= ... <= s_(m)``, the r-th ordered score is the
    maximum in exactly ``r - 1`` unordered pairs. This gives an O(m log m)
    implementation instead of explicit O(m^2) pair construction.
    """
    arr = _as_score_matrix(scores)
    n_views = arr.shape[0]
    if n_views < 2:
        raise ValueError("PairRisk requires at least two views.")

    ordered = np.sort(arr, axis=0)
    weights = np.arange(n_views, dtype=np.float64)[:, None]
    n_pairs = n_views * (n_views - 1) / 2.0
    return (ordered * weights).sum(axis=0) / n_pairs


def pairrisk_decomposition(scores: ArrayLike) -> tuple[FloatArray, FloatArray, FloatArray]:
    """Return PairRisk, mean score, and half mean pairwise absolute difference."""
    arr = _as_score_matrix(scores)
    n_views = arr.shape[0]
    if n_views < 2:
        raise ValueError("PairRisk decomposition requires at least two views.")

    mean = arr.mean(axis=0)
    absolute_sum = np.zeros(arr.shape[1], dtype=np.float64)
    n_pairs = 0
    for i in range(n_views - 1):
        for j in range(i + 1, n_views):
            absolute_sum += np.abs(arr[i] - arr[j])
            n_pairs += 1
    disagreement_penalty = 0.5 * absolute_sum / n_pairs
    pairrisk = mean + disagreement_penalty
    return pairrisk, mean, disagreement_penalty


def logmeanexp_scores(scores: ArrayLike, tau: float) -> FloatArray:
    """Cardinality-normalized smooth maximum (LogMeanExp).

    ``tau`` must be positive. As ``tau -> 0``, the operator approaches max;
    as ``tau`` grows, it approaches the arithmetic mean.
    """
    arr = _as_score_matrix(scores)
    if not np.isfinite(tau) or tau <= 0:
        raise ValueError(f"tau must be finite and positive, got {tau!r}.")

    scaled = arr / tau
    max_scaled = scaled.max(axis=0, keepdims=True)
    # Stable log(mean(exp(.))) computation.
    lme = max_scaled.squeeze(0) + np.log(np.exp(scaled - max_scaled).mean(axis=0))
    return tau * lme
