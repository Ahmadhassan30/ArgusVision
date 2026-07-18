"""Cross-fitted design analysis and LogMeanExp temperature selection."""

from __future__ import annotations

from dataclasses import asdict

import numpy as np
import pandas as pd
from sklearn.model_selection import KFold

from .constants import LME_TAU_GRID, PRIMARY_ALPHA, RANDOM_SEED
from .evaluate import (
    LesionRecord,
    build_lesion_records,
    evaluate_from_scores,
    score_records,
)


def cross_fitted_method(
    records: list[LesionRecord],
    *,
    method: str,
    alpha: float = PRIMARY_ALPHA,
    tau: float | None = None,
    n_splits: int = 5,
    seed: int = RANDOM_SEED,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    if len(records) < n_splits * 2:
        raise ValueError("Not enough lesion records for requested folds.")
    splitter = KFold(n_splits=n_splits, shuffle=True, random_state=seed)
    summary_rows: list[dict[str, object]] = []
    lesion_rows: list[pd.DataFrame] = []

    indices = np.arange(len(records))
    for fold, (cal_idx, val_idx) in enumerate(splitter.split(indices), start=1):
        cal_records = [records[i] for i in cal_idx]
        val_records = [records[i] for i in val_idx]
        cal_scores, cal_labels = score_records(cal_records, method, tau=tau)
        val_scores, _ = score_records(val_records, method, tau=tau)
        evaluation, lesion_frame = evaluate_from_scores(
            method=method,
            calibration_scores=cal_scores,
            calibration_labels=cal_labels,
            test_scores=val_scores,
            test_records=val_records,
            alpha=alpha,
        )
        row = asdict(evaluation)
        row.update({"fold": fold, "tau": tau})
        summary_rows.append(row)
        lesion_frame["fold"] = fold
        lesion_frame["method"] = method
        lesion_frame["tau"] = tau
        lesion_rows.append(lesion_frame)

    return pd.DataFrame(summary_rows), pd.concat(lesion_rows, ignore_index=True)


def select_lme_tau(
    records: list[LesionRecord],
    *,
    tau_grid: tuple[float, ...] = LME_TAU_GRID,
    minimum_coverage: float = 0.88,
    alpha: float = PRIMARY_ALPHA,
    seed: int = RANDOM_SEED,
) -> tuple[float, pd.DataFrame]:
    rows = []
    for tau in tau_grid:
        folds, _ = cross_fitted_method(
            records,
            method="logmeanexp",
            tau=tau,
            alpha=alpha,
            seed=seed,
        )
        row = {
            "tau": tau,
            "mean_coverage": folds["coverage"].mean(),
            "mean_set_size": folds["average_set_size"].mean(),
            "mean_singleton_rate": folds["singleton_rate"].mean(),
            "mean_csc": folds["conditional_singleton_consistency"].mean(),
            "mean_ssy": folds["safe_singleton_yield"].mean(),
        }
        rows.append(row)

    table = pd.DataFrame(rows).sort_values("tau").reset_index(drop=True)
    eligible = table[table["mean_coverage"] >= minimum_coverage]
    if eligible.empty:
        # Conservative deterministic fallback: choose highest observed coverage,
        # then smallest average set size, then smallest tau.
        chosen = table.sort_values(
            ["mean_coverage", "mean_set_size", "tau"],
            ascending=[False, True, True],
        ).iloc[0]
    else:
        chosen = eligible.sort_values(["mean_set_size", "tau"]).iloc[0]
    return float(chosen["tau"]), table
