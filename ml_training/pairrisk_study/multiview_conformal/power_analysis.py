"""Empirical power and precision simulation for paired lesion-level differences."""

from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd
from numpy.typing import ArrayLike


@dataclass(frozen=True)
class PowerResult:
    target_effect: float
    target_n: int
    simulations: int
    bootstrap_replicates: int
    estimated_power: float
    median_ci_width: float


def _percentile_ci(values: np.ndarray, confidence: float = 0.95) -> tuple[float, float]:
    tail = (1.0 - confidence) / 2.0
    return tuple(np.quantile(values, [tail, 1.0 - tail]).tolist())


def empirical_bootstrap_power(
    paired_differences: ArrayLike,
    *,
    target_n: int,
    target_effects: tuple[float, ...],
    simulations: int = 1000,
    bootstrap_replicates: int = 500,
    seed: int = 2026,
) -> list[PowerResult]:
    """Estimate power for mean paired differences using empirical residuals.

    The observed paired differences are centered to preserve their empirical
    variance and shape. Each requested target mean effect is then added before
    pseudo-final-test sampling.
    """
    diffs = np.asarray(paired_differences, dtype=np.float64).reshape(-1)
    diffs = diffs[np.isfinite(diffs)]
    if diffs.size < 20:
        raise ValueError("At least 20 finite paired differences are required.")
    if target_n < 20:
        raise ValueError("target_n must be at least 20.")
    if simulations < 1 or bootstrap_replicates < 100:
        raise ValueError("Use at least one simulation and 100 bootstrap replicates.")

    rng = np.random.default_rng(seed)
    residuals = diffs - diffs.mean()
    results: list[PowerResult] = []

    for effect in target_effects:
        rejects = 0
        widths: list[float] = []
        population = residuals + effect
        for _ in range(simulations):
            sample = rng.choice(population, size=target_n, replace=True)
            boot_means = np.empty(bootstrap_replicates, dtype=np.float64)
            for b in range(bootstrap_replicates):
                boot_means[b] = rng.choice(sample, size=target_n, replace=True).mean()
            low, high = _percentile_ci(boot_means)
            widths.append(high - low)
            if high < 0 or low > 0:
                rejects += 1
        results.append(
            PowerResult(
                target_effect=float(effect),
                target_n=int(target_n),
                simulations=int(simulations),
                bootstrap_replicates=int(bootstrap_replicates),
                estimated_power=float(rejects / simulations),
                median_ci_width=float(np.median(widths)),
            )
        )
    return results


def power_precision_sensitivity(
    paired_differences: ArrayLike,
    *,
    reference_set_size: float,
    target_sizes: tuple[int, ...] = (350, 493, 650),
    relative_effects: tuple[float, ...] = (0.02, 0.03, 0.05, 0.10),
    simulations: int = 1000,
    bootstrap_replicates: int = 500,
    seed: int = 2026,
) -> pd.DataFrame:
    """Run the frozen grid of planning sample sizes and relative effects."""
    if tuple(target_sizes) != (350, 493, 650):
        raise ValueError("Power sensitivity must use target sizes 350, 493, and 650.")
    if tuple(relative_effects) != (0.02, 0.03, 0.05, 0.10):
        raise ValueError("Power sensitivity must use relative effects 2%, 3%, 5%, and 10%.")
    if not np.isfinite(reference_set_size) or reference_set_size <= 0:
        raise ValueError("reference_set_size must be finite and positive.")

    target_effects = tuple(-float(effect) * reference_set_size for effect in relative_effects)
    rows: list[dict[str, object]] = []
    for target_n in target_sizes:
        results = empirical_bootstrap_power(
            paired_differences,
            target_n=target_n,
            target_effects=target_effects,
            simulations=simulations,
            bootstrap_replicates=bootstrap_replicates,
            seed=seed + target_n,
        )
        for relative_effect, result in zip(relative_effects, results, strict=True):
            row = asdict(result)
            row.update(
                {
                    "relative_set_size_effect": float(relative_effect),
                    "relative_set_size_effect_percent": float(relative_effect * 100.0),
                    "sample_size_role": (
                        "development-derived planning estimate; not an observed final-test lesion count"
                        if target_n == 493
                        else "planning sensitivity scenario"
                    ),
                    "development_derived_planning_estimate": bool(target_n == 493),
                }
            )
            rows.append(row)
    return pd.DataFrame(rows)
