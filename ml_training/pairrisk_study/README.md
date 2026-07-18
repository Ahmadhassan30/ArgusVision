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
- risk-design-only LogMeanExp temperature selection;
- empirical paired power/precision simulation;
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
  --output-dir outputs/design_stage
```

When the ISIC image files are locally available, also provide:

```bash
  --image-root /path/to/ISIC_2019_Training_Input
```

No final-test file is required or permitted at this stage.
