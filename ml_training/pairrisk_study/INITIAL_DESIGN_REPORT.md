# PairRisk Initial Design-Stage Implementation Report

**Status:** design-stage only; `risk_calibration` has not been used for method selection and `final_test` was not accessed.

## Implementation completed

- deterministic lesion-level design/calibration split with seed 2026;
- deterministic APS candidate-label scoring;
- mean-probability, mean-score, normalized LogMeanExp, PairRisk, and maximum aggregation;
- PairRisk brute-force and sorted implementations with identity tests;
- cross-fitted design evaluation;
- risk-design-only LogMeanExp temperature selection;
- paired lesion-level bootstrap;
- empirical power/precision simulation;
- view-count and model-difficulty audit.

All **18 automated tests pass**.

## Dataset audit

- Images: **3,297**
- Lesions: **1,693**
- Multi-view lesions: **740**
- `risk_design` lesions: **677**
- `risk_design` multi-view lesions: **296**
- `risk_calibration` lesions kept untouched for method selection: **1,016**
- Selected normalized LogMeanExp temperature on `risk_design`: **τ = 0.05**

Image-byte duplicate hashing could not run in this environment because the ISIC image files are not mounted. The implementation will perform SHA-256 auditing when an image root is supplied on Kaggle or locally.

## Cross-fitted design results

| method           |   coverage |   avg_set_size |   singleton_rate |    csc |    ssy |
|:-----------------|-----------:|---------------:|-----------------:|-------:|-------:|
| logmeanexp       |     0.9020 |         2.3945 |           0.2807 | 0.9869 | 0.2756 |
| max_score        |     0.9054 |         2.4660 |           0.2333 | 0.9234 | 0.2160 |
| mean_probability |     0.9087 |         2.5469 |           0.1690 | 0.9611 | 0.1623 |
| mean_score       |     0.9021 |         2.4692 |           0.2773 | 1.0000 | 0.2773 |
| pairrisk         |     0.9021 |         2.3914 |           0.2603 | 0.9520 | 0.2486 |

## PairRisk versus full maximum

- Absolute average-set-size difference: **-0.0743**
- 95% paired lesion-bootstrap interval: **[-0.1655, 0.0204]**
- Relative reduction: **3.01%**

The direction favors PairRisk, but the interval crosses zero and the reduction is below the provisional 5% target.

## PairRisk versus normalized LogMeanExp

- CSC difference: **-0.0274**, 95% CI **[-0.0673, -0.0003]**
- Safe singleton yield difference: **-0.0270**, 95% CI **[-0.0541, -0.0034]**

On this design split, normalized LogMeanExp is at least as efficient as PairRisk and has stronger singleton consistency/yield. This is an important negative result and must not be hidden or tuned away.

## View-count audit

| outcome                     |   n_lesions |   spearman_rho |   p_value_descriptive |
|:----------------------------|------------:|---------------:|----------------------:|
| average_entropy             |         296 |        0.02896 |             0.6197    |
| view_error_fraction         |         296 |        0.1755  |             0.002438  |
| pairwise_top_disagreement   |         296 |        0.2881  |             4.563e-07 |
| true_score_mean_probability |         296 |       -0.03529 |             0.5453    |
| true_score_mean_score       |         296 |        0.03824 |             0.5122    |
| true_score_logmeanexp       |         296 |        0.2012  |             0.0004974 |
| true_score_pairrisk         |         296 |        0.0847  |             0.1461    |
| true_score_max              |         296 |        0.322   |             1.436e-08 |

The full maximum has the strongest positive association with view count (`rho ≈ 0.322`), while PairRisk is much less associated (`rho ≈ 0.085`). This supports the original count-sensitivity problem formulation. LogMeanExp remains moderately associated with view count (`rho ≈ 0.201`).

View-level error fraction and pairwise top-class disagreement also rise with view count, indicating an informative acquisition association may coexist with the mechanical maximum effect. This is associative, not causal.

## Precision planning

|   target_effect |   target_n |   simulations |   bootstrap_replicates |   estimated_power |   median_ci_width |
|----------------:|-----------:|--------------:|-----------------------:|------------------:|------------------:|
|         -0.0493 |   493.0000 |      200.0000 |               200.0000 |            0.2850 |            0.1441 |
|         -0.1233 |   493.0000 |      200.0000 |               200.0000 |            0.9250 |            0.1421 |
|         -0.2466 |   493.0000 |      200.0000 |               200.0000 |            1.0000 |            0.1424 |

The current approximation suggests about 92.5% power for a 5% relative set-size effect at the expected final multi-view sample size, but only about 28.5% power for a 2% effect. This simulation is planning evidence, not a formal guarantee.

## Honest go/no-go assessment

The implementation is functioning correctly, but **PairRisk has not yet earned promotion as the primary method**:

1. It reduces full-maximum set size by only about 3% on cross-fitted `risk_design` data, with uncertainty crossing zero.
2. It does not outperform normalized LogMeanExp on efficiency, CSC, singleton accuracy, or safe singleton yield.
3. It does substantially reduce the view-count association relative to maximum, which may support a comparative count-sensitivity paper even if PairRisk is not the best triage operator.

### Next mandatory step before calibration

Run the exact image-byte duplicate audit in the real repository/Kaggle environment, verify the split and source metadata, and rerun this design analysis unchanged. Do **not** access `risk_calibration` for method selection and do **not** access `final_test`.
