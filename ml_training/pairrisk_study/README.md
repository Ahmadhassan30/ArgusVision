# Argus PairRisk implementation

This bundle implements the design-stage pipeline for **fixed-order multi-view conformal aggregation** using the existing Stage 5 `risk_dev_predictions` export.

## What is implemented

- lesion-bag validation and deterministic design/calibration splitting;
- optional exact image-byte duplicate collapse;
- deterministic APS candidate-label scores;
- mean-probability, mean-score, normalized LogMeanExp, PairRisk, and maximum aggregation;
- PairRisk brute-force and O(m log m) implementations;
- lesion-level conformal calibration and evaluation;
- singleton rate, conditional singleton consistency, and safe singleton yield;
- five-fold cross-fitted design evaluation;
- frozen split-file reuse with strict lesion identity validation;
- nested five-fold LogMeanExp evaluation with inner-fold temperature selection;
- empirical paired power/precision sensitivity simulation;
- paired lesion bootstrap for method and view-count correlation differences;
- protocol guard against paths containing `final_test`;
- unit tests for all load-bearing identities.

## Run tests

```bash
cd /path/to/argus_pairrisk_implementation
PYTHONPATH=. pytest -q multiview_conformal/tests
```

## Run the initial design stage

```bash
cd /path/to/argus_pairrisk_implementation
PYTHONPATH=. python -m multiview_conformal.run_initial_implementation \
  --predictions /path/to/risk_dev_predictions.csv \
  --split-file /path/to/ml_training/pairrisk_study/protocol/lesion_split.csv \
  --output-dir outputs/design_stage
```

When `--split-file` is supplied, the existing `risk_design` and
`risk_calibration` assignments are validated and reused without regeneration.
The globally frozen LogMeanExp temperature remains `0.05`; inner-fold
temperature selection is used only for the separate nested design comparison.

The design-stage correction exports `nested_lme_fold_metrics.csv`,
`nested_lme_selected_tau.csv`, `nested_lme_vs_pairrisk_bootstrap.csv`,
`power_precision_sensitivity.csv`, and `view_count_correlation_bootstrap.csv`.
The 493-lesion power scenario is a development-derived planning estimate, not
an observed final-test lesion count.

When the ISIC image files are locally available, also provide:

```bash
  --image-root /path/to/ISIC_2019_Training_Input
```

No final-test file is required or permitted at this stage.
