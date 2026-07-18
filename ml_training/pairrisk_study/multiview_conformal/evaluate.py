"""Lesion-level score construction, calibration, and evaluation."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable

import numpy as np
import pandas as pd
from numpy.typing import NDArray

from .aggregators import logmeanexp_scores, max_scores, mean_scores, pairrisk_scores
from .conformal import aps_scores, calibrate_quantile, prediction_sets
from .constants import CLASS_ORDER, PROBABILITY_COLUMNS


FloatArray = NDArray[np.float64]


@dataclass(frozen=True)
class LesionRecord:
    lesion_group: str
    label: int
    label_name: str
    n_views: int
    view_probabilities: FloatArray
    view_aps_scores: FloatArray
    mean_probability: FloatArray
    view_top_classes: NDArray[np.int64]


@dataclass(frozen=True)
class MethodEvaluation:
    method: str
    threshold: float
    n_lesions: int
    coverage: float
    average_set_size: float
    median_set_size: float
    singleton_rate: float
    singleton_accuracy: float
    conditional_singleton_consistency: float
    safe_singleton_yield: float
    empty_set_rate: float
    full_set_rate: float


def build_lesion_records(frame: pd.DataFrame) -> list[LesionRecord]:
    records: list[LesionRecord] = []
    for lesion_group, bag in frame.groupby("lesion_group", sort=True):
        labels = bag["label"].astype(int).unique()
        if labels.size != 1:
            raise ValueError(f"Lesion {lesion_group} has inconsistent labels.")
        probs = bag.loc[:, PROBABILITY_COLUMNS].to_numpy(dtype=np.float64)
        view_scores = aps_scores(probs)
        records.append(
            LesionRecord(
                lesion_group=str(lesion_group),
                label=int(labels[0]),
                label_name=str(bag["label_name"].iloc[0]),
                n_views=len(bag),
                view_probabilities=probs,
                view_aps_scores=view_scores,
                mean_probability=probs.mean(axis=0),
                view_top_classes=np.argmax(probs, axis=1).astype(np.int64),
            )
        )
    return records


def score_record(record: LesionRecord, method: str, *, tau: float | None = None) -> FloatArray:
    if method == "mean_score":
        return mean_scores(record.view_aps_scores)
    if method == "max_score":
        return max_scores(record.view_aps_scores)
    if method == "pairrisk":
        return pairrisk_scores(record.view_aps_scores)
    if method == "logmeanexp":
        if tau is None:
            raise ValueError("logmeanexp requires tau.")
        return logmeanexp_scores(record.view_aps_scores, tau=tau)
    if method == "mean_probability":
        return aps_scores(record.mean_probability[None, :])[0]
    raise KeyError(f"Unknown aggregation method: {method}")


def score_records(
    records: Iterable[LesionRecord], method: str, *, tau: float | None = None
) -> tuple[FloatArray, NDArray[np.int64]]:
    records = list(records)
    candidate_scores = np.vstack([score_record(record, method, tau=tau) for record in records])
    labels = np.asarray([record.label for record in records], dtype=np.int64)
    return candidate_scores, labels


def pair_support(record: LesionRecord, singleton_class: int) -> float:
    counts = int(np.sum(record.view_top_classes == singleton_class))
    n = record.n_views
    if n < 2:
        return float("nan")
    return (counts * (counts - 1) / 2.0) / (n * (n - 1) / 2.0)


def evaluate_from_scores(
    *,
    method: str,
    calibration_scores: FloatArray,
    calibration_labels: NDArray[np.int64],
    test_scores: FloatArray,
    test_records: list[LesionRecord],
    alpha: float,
) -> tuple[MethodEvaluation, pd.DataFrame]:
    true_cal = calibration_scores[np.arange(len(calibration_labels)), calibration_labels]
    threshold = calibrate_quantile(true_cal, alpha=alpha)
    sets = prediction_sets(test_scores, threshold)
    labels = np.asarray([r.label for r in test_records], dtype=np.int64)
    set_sizes = sets.sum(axis=1)
    covered = sets[np.arange(len(labels)), labels]
    singleton = set_sizes == 1
    singleton_labels = np.where(singleton, np.argmax(sets, axis=1), -1)
    singleton_correct = singleton & (singleton_labels == labels)

    support = np.full(len(test_records), np.nan, dtype=np.float64)
    for idx, (record, is_singleton, predicted) in enumerate(
        zip(test_records, singleton, singleton_labels, strict=True)
    ):
        if is_singleton:
            support[idx] = pair_support(record, int(predicted))

    singleton_rate = float(singleton.mean())
    singleton_accuracy = (
        float(singleton_correct.sum() / singleton.sum()) if singleton.any() else float("nan")
    )
    csc = float(np.nanmean(support)) if singleton.any() else float("nan")
    ssy = float(np.nansum(np.where(singleton, support, 0.0)) / len(test_records))

    evaluation = MethodEvaluation(
        method=method,
        threshold=float(threshold),
        n_lesions=len(test_records),
        coverage=float(covered.mean()),
        average_set_size=float(set_sizes.mean()),
        median_set_size=float(np.median(set_sizes)),
        singleton_rate=singleton_rate,
        singleton_accuracy=singleton_accuracy,
        conditional_singleton_consistency=csc,
        safe_singleton_yield=ssy,
        empty_set_rate=float((set_sizes == 0).mean()),
        full_set_rate=float((set_sizes == len(CLASS_ORDER)).mean()),
    )

    rows = []
    for idx, record in enumerate(test_records):
        rows.append(
            {
                "lesion_group": record.lesion_group,
                "label": record.label,
                "label_name": record.label_name,
                "n_views": record.n_views,
                "covered": bool(covered[idx]),
                "set_size": int(set_sizes[idx]),
                "singleton": bool(singleton[idx]),
                "singleton_label": int(singleton_labels[idx]),
                "singleton_correct": bool(singleton_correct[idx]),
                "pair_support": float(support[idx]) if np.isfinite(support[idx]) else np.nan,
            }
        )
    return evaluation, pd.DataFrame(rows)
