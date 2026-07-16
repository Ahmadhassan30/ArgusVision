# Focal Loss Publication Audit

Date: 2026-07-16

## Old Mathematical Issue

The old `ml_training/losses.py` implementation computed:

```python
ce = F.cross_entropy(logits, targets, weight=alpha, reduction="none")
pt = torch.exp(-ce)
loss = (1 - pt) ** gamma * ce
```

When `alpha` was non-null, `ce` was already class-weighted. That made `pt`
equal to `exp(-alpha[target] * CE)` instead of the model's true probability for
the target class.

## Correct Formula

The corrected implementation computes:

```python
log_probs = F.log_softmax(logits, dim=1)
log_pt = log_probs.gather(dim=1, index=targets.unsqueeze(1)).squeeze(1)
pt = log_pt.exp()
base_ce = -log_pt
if alpha is not None:
    base_ce = base_ce * alpha[target]
loss = (1 - pt) ** gamma * base_ce
```

`pt` is always the true target-class probability. `alpha` scales only the base
cross-entropy term.

## Publication Imbalance Policy

Configured defaults:

```python
USE_WEIGHTED_SAMPLER_STAGE_B = True
USE_CLASS_WEIGHTED_LOSS_STAGE_B = False
ALLOW_LEGACY_STAGE_B_DOUBLE_REBALANCING = False
```

Publication-rescue training uses one explicit imbalance method per stage:

- Representation learning: ordinary shuffled `DataLoader`, `FocalLoss(gamma=2, alpha=None)`.
- Frozen-head rebalancing: `WeightedRandomSampler`, `FocalLoss(gamma=2, alpha=None)`.

`training_utils.assert_single_stage_b_rebalancing(...)` raises if both Stage-B
weighted sampling and class-weighted focal loss are enabled unless
`ALLOW_LEGACY_STAGE_B_DOUBLE_REBALANCING` is explicitly set outside the
publication run.

## Changed Call Sites

- `ml_training/losses.py`: corrected reusable `FocalLoss`.
- `ml_training/01_train_agent_a.ipynb`: corrected inline focal math; Phase-1 and Stage-B focal loss now use `alpha=None` by default while the weighted sampler handles rebalancing.
- `ml_training/02_train_agent_b.ipynb`: corrected inline focal math; Phase-1 and Stage-B focal loss now use `alpha=None` by default while the weighted sampler handles rebalancing.
- `ml_training/verify_decoupled.py`: verifies the publication Stage-B rebalancing invariant.
- `ml_training/config.py`: added publication imbalance flags.
