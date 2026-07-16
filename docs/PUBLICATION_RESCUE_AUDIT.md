# Argus Vision Publication Rescue Audit

Branch: `paper-rescue`  
Date: 2026-07-16  
Scope: repository inspection only. No scientific code, notebooks, checkpoints, or final result files were modified.

## Preservation Status

- Repository was clean on `master` before branch creation, so no pre-change snapshot commit was required.
- Created and switched to `paper-rescue`.
- Existing checkpoints and notebooks were left untouched.
- This audit is the only intended repository change.

## Files Inspected

Core training files:

- `ml_training/splits.py`
- `ml_training/config.py`
- `ml_training/losses.py`
- `ml_training/dataset.py`
- `ml_training/transforms.py`
- `ml_training/training_utils.py`

Notebooks:

- `ml_training/01_train_agent_a.ipynb`
- `ml_training/02_train_agent_b.ipynb`
- `ml_training/03_build_hard_subset.ipynb`
- `ml_training/04_train_consensus.ipynb`
- `ml_training/05_evaluation.ipynb`

Related serving/checkpoint files:

- `backend/core/config.py`
- `backend/ml/pipeline.py`
- `backend/ml/agents/agent_a.py`
- `backend/ml/agents/agent_b.py`
- `backend/ml/consensus/classifier.py`
- `README.md`
- `context.md`

## Old Split Protocol Reconstructed

The publication-era split call to preserve/reconstruct is:

```python
get_lesion_grouped_split(
    full_dataframe,
    test_size=0.15,
    random_state=42,
)
```

The current implementation in `ml_training/splits.py` requires an explicit `label_col`, so real notebook calls are:

```python
get_lesion_grouped_split(df, label_col="_label", test_size=0.15, random_state=42)
get_lesion_grouped_split(df, label_col="label", test_size=0.15, random_state=SEED)
```

where `SEED` is defined as `42` in the notebooks. In `splits.py`, `DEFAULT_TEST_SIZE = 0.15` and `DEFAULT_SEED = 42`.

Implementation details:

- If scikit-learn is installed, the primary splitter is `StratifiedGroupKFold` with `n_splits = round(1 / test_size)`, so `0.15` produces approximately `7` folds.
- It uses `shuffle=True` and `random_state=42`.
- If `StratifiedGroupKFold` fails for sparse class/group layouts, it falls back to `GroupShuffleSplit(n_splits=1, test_size=0.15, random_state=42)`.
- If scikit-learn is unavailable, a deterministic pure-Python grouped fallback is used.
- Group keys are `L:<lesion_id>` when `lesion_id` is present, otherwise `I:<normalized_image_id>`.

Important reconstruction blocker: the repository does not contain the Kaggle-mounted ISIC CSVs, so the exact seed-42 row membership cannot be recomputed locally from this checkout alone.

## Exact Split Call Locations

| File | Location | Function | Partition | Role |
| --- | --- | --- | --- | --- |
| `ml_training/splits.py` | lines 315-366 | `get_lesion_grouped_split` | default `test_size=0.15`, `random_state=42` | Shared dataframe splitter. |
| `ml_training/splits.py` | lines 195-280 | `lesion_grouped_indices` | default `test_size=0.15`, `random_state=42` | Shared sequence/index splitter. |
| `ml_training/01_train_agent_a.ipynb` | cell 5 | `get_lesion_grouped_split(df, label_col="_label", test_size=0.15, random_state=42)` | old 85/15 | Agent A train/validation split. |
| `ml_training/02_train_agent_b.ipynb` | cell 9 | `get_lesion_grouped_split(df, label_col="label", test_size=0.15, random_state=SEED)` | old 85/15 | Agent B train/validation split; `SEED = 42`. |
| `ml_training/03_build_hard_subset.ipynb` | cell 4 | `lesion_grouped_indices(..., test_size=0.15, random_state=42)` | old 85/15 | Rebuilds the split used for hard-subset mining. |
| `ml_training/04_train_consensus.ipynb` | cell 6 | `get_lesion_grouped_split(df, label_col="_label", test_size=0.15, random_state=42)` | old 85/15 | Consensus train pool vs held-out `val_df`. |
| `ml_training/04_train_consensus.ipynb` | cell 10 | `lesion_grouped_indices(..., test_size=0.20, random_state=42)` | internal 80/20 | Consensus-feature train/validation split, not the old 15% partition. |
| `ml_training/05_evaluation.ipynb` | cell 5 | `get_lesion_grouped_split(full_df, label_col="label", test_size=0.15, random_state=SEED)` | old 85/15 | Final-reporting split; `test_df` is the old 15% side. |

Embedded/copy split logic:

- All five notebooks carry embedded `discover_isic()` / dataframe / dataset construction logic.
- All five notebooks import shared split functions from `splits.py`.
- Several notebooks still import `train_test_split`, but the inspected split cells use grouped split helpers, not `train_test_split`, for the main 85/15 data role.
- Markdown in NB03/NB04 still says "`test_size=0.15, stratify=labels, random_state=42`", but code now uses lesion-grouped splitting.

## Every Use of the Old 15% Partition

| File | Location | 15% Side Name | Used For |
| --- | --- | --- | --- |
| `ml_training/01_train_agent_a.ipynb` | cell 5 | `val_df` / `val_loader` | Agent A validation during training. |
| `ml_training/01_train_agent_a.ipynb` | cell 13 | `val_loader` | Early stopping and best-checkpoint selection by validation macro-AUC. |
| `ml_training/01_train_agent_a.ipynb` | cells 17, 19, 21 | `val_loader`, `val_df` | Validation report, confusion matrix, per-class recall flags, Grad-CAM examples. |
| `ml_training/02_train_agent_b.ipynb` | cell 9 | `val_df` / `val_dataset` | Agent B validation during training. |
| `ml_training/02_train_agent_b.ipynb` | cells 15, 17 | `val_loader` | Phase-1 checkpoint selection, phase-2 early stopping, final best checkpoint by validation macro-AUC. |
| `ml_training/02_train_agent_b.ipynb` | cells 21, 25, 27 | `val_loader`, `val_df` | Reload/evaluate best checkpoint, validation report, attention-rollout examples. |
| `ml_training/03_build_hard_subset.ipynb` | cell 4 | `_va` / `val_imgs` created but not mined by current code | Reconstructs the old 15% side; current code mines from `train_imgs` despite markdown saying held-out split. |
| `ml_training/04_train_consensus.ipynb` | cell 6 | `val_df` | Held-out side of old split; current hard-subset restriction is explicitly kept within `train_df`. |
| `ml_training/05_evaluation.ipynb` | cell 5 | `test_df` / `eval_df` | Headline final reporting on the same seed-42 15% partition family. |

## Existing Data Roles

- Agent A training: NB01 trains on the 85% `train_df`; uses the 15% `val_df` for validation macro-AUC early stopping, best checkpoint selection, confusion matrix, report, and Grad-CAM examples.
- Agent B training: NB02 trains on the 85% `train_df`; uses the 15% `val_df` for validation macro-AUC early stopping, best checkpoint selection, confusion matrix, report, and attention-rollout examples.
- Hard subset mining: NB03 code currently mines from the training split (`mining_dataset = ISICDataset(train_imgs, ...)`) even though markdown still describes a held-out validation/test split.
- Consensus training: NB04 starts from the same 85/15 split, restricts to `hard_subset.csv` within `train_df` if available, scans train images for trigger firing, builds 23-d features, then makes an internal lesion-grouped `80/20` split for `X_train`/`X_val`.
- Evaluation: NB05 recreates a grouped 85/15 split and treats the 15% side as `test_df` / `eval_df` for headline reporting.

## Existing Contamination Problem

The same seed-42 15% partition is used as:

- Agent A validation and checkpoint-selection data.
- Agent B validation and checkpoint-selection data.
- NB05 headline "test" / full-split reporting data.
- A source of threshold/abstention recommendations in NB05.

This means the reported test metrics are not independent of model selection. The code has reduced lesion-level leakage by using grouped splitting, but it still conflates validation/model-selection and final reporting roles. Additionally, NB04 uses validation data for LightGBM early stopping and validation reporting, then performs threshold sweeps and calibration assessment on that same validation set, though isotonic calibration fitting itself is documented as training-fold only.

## Validation/Test Use Map

| Component | Data Object | Early Stopping | Checkpoint/Model Selection | Calibration | Threshold Selection | Reporting |
| --- | --- | --- | --- | --- | --- | --- |
| Agent A / NB01 | old 15% `val_df` via `val_loader` | Yes, cell 13, validation macro-AUC patience. | Yes, cell 13 saves `agent_a_best.pth` on validation macro-AUC. | No explicit calibration fitting. | No threshold selection. | Yes, cells 17/19/21. |
| Agent B / NB02 | old 15% `val_df` via `val_loader` | Yes, cell 17, validation macro-AUC patience. | Yes, cells 15/17 save `agent_b_best.pth` on validation macro-AUC. | No explicit calibration fitting. | No threshold selection. | Yes, cells 21/25/27. |
| Hard subset / NB03 | current code mines `train_imgs`; `_va` old 15% exists but is not mined | No training loop. | No checkpoint selection. | No calibration. | Yes, cells 10/12 apply fixed JS/entropy thresholds to produce `hard_subset.csv`. | Yes, reports fire rates and hard-subset distributions. |
| Consensus / NB04 | internal `X_val`/`y_val` from fired train-pool features | Yes, LightGBM uses `eval_set=[(X_val, y_val)]` with early stopping in cell 12. | Yes, cell 12 chooses final LightGBM/calibrated model based on validation ECE and validation metrics. | Isotonic fitting uses training folds only, but calibration decision/evaluation uses `X_val`. | Yes, cell 12 sweeps `TAU_JS_OPTIONS` and `TAU_ENTROPY_OPTIONS` on `X_val`/`y_val`. | Yes, cell 12 reports validation balanced accuracy, ECE, confusion matrix, feature importance, MEL->NV, SCC metrics. |
| Evaluation / NB05 | old 15% `test_df` / `eval_df` | No training loop. | No checkpoint saving, but evaluates already selected models. | No fitting, but reports ECE on `eval_df`. | Yes, cell 15 recommends abstention threshold on `eval_df`. | Yes, cells 11/15/22/30/31 write headline metrics, hard-subset metrics, confusion/audit outputs. |

## Label, Image, Metadata, and Sorting Findings

Static schema facts from code:

| Item | Static Value / Rule | Locations |
| --- | --- | --- |
| Source ground-truth CSV path | Runtime-discovered `CSV_PATH` from `discover_isic(root="/kaggle/input")`; the selected CSV is the first walked CSV whose header contains all 8 canonical ISIC class names. | All five notebooks define/use `discover_isic()`. |
| Metadata CSV path | Runtime-discovered by `attach_lesion_ids()` unless `metadata_path` is provided; search roots are `("/kaggle/input", "/kaggle/working", ".")`. Expected file named in comments/warnings: `ISIC_2019_Training_Metadata.csv`. | `ml_training/splits.py`, lines 405-475. |
| Source image column | Prefer a column named `image`; some notebooks fall back to the first source column if absent. | NB01 cell 5, NB02 cell 5, NB03 cell 4, NB04 cell 6, NB05 cell 5. |
| Runtime image identifiers | NB01 `_image`; NB02 `image` plus `path`; NB03 `images_all`; NB04 source `id_col`; NB05 `image_id` plus `image_path`. | Notebook cells above. |
| Source label columns | Wide one-hot columns in canonical order: `MEL`, `NV`, `BCC`, `AK`, `BKL`, `DF`, `VASC`, `SCC`. | Notebooks and `ml_training/config.py`. |
| Runtime label columns | NB01 and NB04 use `_label`; NB02, NB03, and NB05 use `label`; all are `argmax` over the 8 one-hot columns. | NB01 cell 5, NB02 cell 5, NB03 cell 4, NB04 cell 6, NB05 cell 5. |
| Lesion column | `lesion_id` after `attach_lesion_ids()`. Metadata candidates are `lesion_id`, `lesion`, `lesionid`. | `ml_training/splits.py`, lines 43 and 405-475. |
| Generic dataset module labels | `dataset.py` requires `image`; supports one-hot class columns or long labels from `label`, `Label`, `LABEL`, `target`, `diagnosis`, `dx`. | `ml_training/dataset.py`, lines 102-159. |

Lesion ID coverage:

- Coverage is computed at runtime by `attach_lesion_ids()` and printed as `present/n (pct%)`.
- The code records the percentage in split stats as `pct_with_lesion_id`.
- Exact coverage percentage is the one schema/data fact that cannot be verified from this checkout because the Kaggle metadata CSV is absent.
- If metadata is absent, `attach_lesion_ids()` creates an all-null `lesion_id` column, causing grouping to degrade to image-level singleton groups. That remains row-disjoint, but it does not provide lesion-level protection.

Dataframe ordering/sorting consistency:

| Notebook | Construction Before Split | Explicit Full-Frame Sort? | Same As Others? |
| --- | --- | --- | --- |
| NB01 | `df = pd.read_csv(CSV_PATH)`, attach lesions, then assign `_label` and `_image`. | No. | Similar raw CSV order, but keeps full CSV rows without existence filtering. |
| NB02 | `raw = pd.read_csv(CSV_PATH)`, builds compact `df`, adds `path`, filters to rows whose image exists, `reset_index(drop=True)`, then attaches lesions. | No. | May differ from NB01/NB03/NB04 if any image is missing. |
| NB03 | `gt = pd.read_csv(CSV_PATH)`, builds `images_all`/`labels_all`, then `_split_df` for split. | No. | Raw CSV order, no existence filter. |
| NB04 | `df = pd.read_csv(CSV_PATH)`, assigns `_label`, attaches lesions, splits, then may restrict `train_df` by `hard_subset.csv`. | No. | Pre-split resembles NB01/NB03, but downstream training pool may differ after hard-subset filtering. |
| NB05 | `gt = pd.read_csv(CSV_PATH)`, builds records with resolved `image_path`, filters missing paths, `reset_index(drop=True)`, then attaches lesions. | No. | May differ from raw-order notebooks if any image is missing. |

Conclusion: the notebooks do not all provably create the same dataframe before splitting, and none performs a canonical `sort_values(...)` on the full dataframe before the old seed-42 split.

## Old Checkpoint and Artifact Locations

Local archived serving files currently present:

| Path | Size | Notes |
| --- | ---: | --- |
| `backend/checkpoints/agent_a_best.pth` | 71,003,811 bytes | Existing Agent A checkpoint. |
| `backend/checkpoints/agent_b_best.pth` | 343,279,329 bytes | Existing Agent B checkpoint. |
| `backend/checkpoints/consensus_lgbm.pkl` | 4,193,652 bytes | Existing LightGBM consensus model. |
| `backend/checkpoints/consensus_lgbm.json` | 1,337 bytes | Existing LightGBM sidecar. |
| `backend/checkpoints/consensus_scaler.pkl` | 1,151 bytes | Existing consensus scaler. |
| `backend/checkpoints/consensus_scaler.json` | 972 bytes | Existing scaler sidecar. |
| `backend/checkpoints/.gitkeep` | 318 bytes | Placeholder/readme-style file; not a model. |

Backend checkpoint configuration and load paths:

| File | Lines / Location | Path or Name |
| --- | --- | --- |
| `backend/core/config.py` | lines 33-45 | `MODEL_CHECKPOINT_DIR = "./checkpoints"`, `AGENT_A_CHECKPOINT = "agent_a_best.pth"`, `AGENT_B_CHECKPOINT = "agent_b_best.pth"`, `CONSENSUS_CHECKPOINT = "consensus_best.pth"`, `CONSENSUS_SCALER = "consensus_scaler.pkl"`. |
| `backend/ml/pipeline.py` | lines 83-100 | Builds `agent_a_ckpt`, `agent_b_ckpt`, `consensus_ckpt`, `consensus_scaler` with `os.path.join(checkpoint_dir, configured_name)`. |
| `backend/ml/agents/agent_a.py` | lines 80-91 | Loads `checkpoint_path` with `torch.load(checkpoint_path, map_location=...)`. |
| `backend/ml/agents/agent_b.py` | lines 80-91 | Loads `checkpoint_path` with `torch.load(checkpoint_path, map_location=...)`. |
| `backend/ml/consensus/classifier.py` | lines 92-110 | Looks for sibling `consensus_lgbm.pkl` and `consensus_lgbm.json` next to the configured consensus checkpoint. |
| `backend/ml/consensus/classifier.py` | lines 150-192 | Loads PyTorch fallback `consensus_best.pth` if LightGBM is not used. |
| `backend/ml/consensus/classifier.py` | lines 195-242 | Loads `consensus_scaler.pkl` or `consensus_scaler.json`, including sibling candidates next to the checkpoint. |
| `ml_training/config.py` | line 90 | Training-side `CHECKPOINT_DIR = "./checkpoints"`. |

Notebook checkpoint/artifact paths:

| Notebook | Location | Paths |
| --- | --- | --- |
| NB01 `01_train_agent_a.ipynb` | intro, cells 13/22 | `/kaggle/working/agent_a_best.pth`, `/kaggle/working/agent_a_stageA.pth`, `agent_a_best.pth.resume`, `agent_a_stageA.pth.resume`, `/kaggle/working/*_resume.pth`, `confusion_matrix.png`, `gradcam_grid.png`, training/sample figures. |
| NB02 `02_train_agent_b.ipynb` | intro, cells 2/15/17/21/28 | `/kaggle/working/agent_b_best.pth`, `/kaggle/working/agent_b_stageA.pth`, `agent_b_best.pth.resume`, `agent_b_stageA.pth.resume`, `/kaggle/working/*_resume.pth`, `figures/agent_b_rollout.png`, validation figures. |
| NB03 `03_build_hard_subset.ipynb` | cells 6/12/19 | Discovers `agent_a_best`, `agent_b_best`; writes `/kaggle/working/hard_subset.csv`, `/kaggle/working/all_scores.csv`, `/kaggle/working/figures/hard_subset_signals.png`, `/kaggle/working/figures/hard_subset_class_dist.png`, `/kaggle/working/figures/hard_subset_top20.png`. |
| NB04 `04_train_consensus.ipynb` | cells 4/10/12/13/14 | Discovers `agent_a_best`, `agent_b_best`, `hard_subset.csv`; writes `/kaggle/working/consensus_lgbm.pkl`, `/kaggle/working/consensus_lgbm.json`, `/kaggle/working/consensus_scaler.pkl`, `/kaggle/working/consensus_scaler.json`, `/kaggle/working/lgbm_feature_importance.csv`, `/kaggle/working/train_image_ids.json`, `/kaggle/working/figures/consensus_confusion_matrix.png`; legacy/docs also mention `/kaggle/working/consensus_best.pth` and `/kaggle/working/consensus_temperature.txt`. |
| NB05 `05_evaluation.ipynb` | intro, cells 3/5/11/15/22/30/31 | Discovers `agent_a_best`, `agent_b_best`, `consensus_lgbm.pkl`, `consensus_lgbm.json`, `consensus_best`, `consensus_scaler.pkl`, `consensus_scaler.json`, `consensus_temperature`, `hard_subset`, `train_image_ids.json`; writes `/kaggle/working/metrics_full_split.csv`, `/kaggle/working/metrics_hard_subset.csv`, `/kaggle/working/ablation_table.csv`, `/kaggle/working/malignant_vs_benign.csv`, `/kaggle/working/confusion_matrix.csv`, `/kaggle/working/confusion_matrix_normalized.csv`, `/kaggle/working/per_class_metrics.csv`, `/kaggle/working/top100_confident_wrong.csv`, `/kaggle/working/figures/abstention_curve.png`, `/kaggle/working/figures/argus_confusion_matrix.png`, `/kaggle/working/figures/case_*.png`. |

Documentation checkpoint references:

- `README.md` lines 183-186: notebook output summary for `agent_a_best.pth`, `agent_b_best.pth`, `hard_subset.csv`, `consensus_best.pth` plus scaler.
- `README.md` line 195: `cp agent_a_best.pth agent_b_best.pth consensus_best.pth backend/checkpoints/`.
- `README.md` line 218: `backend/checkpoints/` described as model weights.
- `context.md` lines 59 and 87-88: backend loads from `checkpoints/`, uses `consensus_scaler.pkl` and `consensus_lgbm.pkl`.

## Test, Validation, Calibration, Threshold, and Reporting Usage

- NB01 cell 13: early stopping and best checkpoint selection use validation macro-AUC.
- NB01 cells 17/19/21: validation data used for reports, confusion matrix, and Grad-CAM visualization.
- NB02 cell 15: phase-1 best checkpoint selection uses validation macro-AUC.
- NB02 cell 17: phase-2 early stopping and best checkpoint selection use validation macro-AUC.
- NB02 cells 25/27: validation data used for reports and attention visualization.
- NB03 cells 10/12: hard subset thresholding uses `JS_THRESHOLD=0.25` and `ENTROPY_THRESHOLD=0.8`; outputs `hard_subset.csv` and `all_scores.csv`.
- NB04 cell 10: `StandardScaler` is fit only on consensus `X_train`; `X_val` is transformed, not fit.
- NB04 cell 12: LightGBM early stopping, validation metrics, ECE assessment, reliability diagram, trigger-threshold sweep, and recommended trigger thresholds all use `X_val`/`y_val`.
- NB04 cell 12: isotonic calibration fitting uses `CalibratedClassifierCV(..., cv=5)` on training data only.
- NB05 cell 5: 15% split is called `test_df` and used for final evaluation.
- NB05 cells 11/15/22/30/31: same evaluation data used for headline metrics, calibration/ECE reporting, abstention threshold recommendation, hard-subset reporting, and misclassification audit outputs.

## Recommended Files to Change Later

Do not implement these yet. Recommended change targets for the future split rescue:

- `ml_training/splits.py`: introduce explicit train/validation/test protocol helpers and metadata coverage assertions.
- `ml_training/01_train_agent_a.ipynb`: use train/validation only for training and checkpoint selection.
- `ml_training/02_train_agent_b.ipynb`: same as NB01.
- `ml_training/03_build_hard_subset.ipynb`: reconcile markdown/code role drift and ensure mining source is explicitly train-only or validation-only according to the new protocol.
- `ml_training/04_train_consensus.ipynb`: isolate consensus training, validation, calibration, and threshold-selection roles.
- `ml_training/05_evaluation.ipynb`: reserve a final untouched test split for reporting only.
- `README.md` and `context.md`: update reported methodology only after reruns produce clean final results.
- Add a lightweight checked-in split test that verifies grouped disjointness, deterministic seed behavior, dataframe ordering expectations, and metadata coverage handling.

## Files That Must Remain Archived and Untouched

- `backend/checkpoints/agent_a_best.pth`
- `backend/checkpoints/agent_b_best.pth`
- `backend/checkpoints/consensus_lgbm.pkl`
- `backend/checkpoints/consensus_lgbm.json`
- `backend/checkpoints/consensus_scaler.pkl`
- `backend/checkpoints/consensus_scaler.json`
- All five existing notebooks listed above, until new split protocol changes are intentionally made.
- Any Kaggle `/kaggle/working/*` outputs referenced by the current notebooks.
- Final reported result files produced by NB05, if present outside this checkout or reattached as Kaggle outputs.

## Lightweight Split Test Results

Existing split-specific tests were searched with:

```text
rg -n "lesion_grouped|split|attach_lesion|DEFAULT_TEST_SIZE|0\.15" ml_training backend\tests
```

No dedicated checked-in `test_splits.py` or equivalent split unit test was found.

Attempted test commands:

```text
python -m pytest ml_training -k split -q
python -m pytest backend\tests -k split -q
py -m pytest ml_training -k split -q
py -m pytest backend\tests -k split -q
```

Output/blocker:

- `python`: not recognized as a command in this shell.
- `py`: not recognized as a command in this shell.

Therefore no lightweight split tests could be executed locally from this environment.

## Blockers to Exact Seed-42 Reconstruction

- The repository does not contain the ISIC-2019 ground-truth CSV.
- The repository does not contain `ISIC_2019_Training_Metadata.csv` or another metadata CSV with `lesion_id`.
- The repository does not contain the Kaggle image directory, so notebook-specific file-existence filters cannot be replayed.
- The local shell has no `python` or `py` command available, preventing local pytest execution.
