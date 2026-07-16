from __future__ import annotations

import os
import sys

import pytest
import torch
import torch.nn.functional as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from losses import FocalLoss
from training_utils import assert_single_stage_b_rebalancing


def _manual_focal(logits, targets, gamma=2.0, alpha=None):
    log_probs = F.log_softmax(logits, dim=1)
    log_pt = log_probs.gather(1, targets.unsqueeze(1)).squeeze(1)
    pt = log_pt.exp()
    base_ce = -log_pt
    if alpha is not None:
        base_ce = base_ce * alpha.to(logits.device, logits.dtype)[targets]
    return (1.0 - pt) ** gamma * base_ce


def test_gamma_zero_without_alpha_matches_cross_entropy() -> None:
    logits = torch.tensor([[1.2, -0.5, 0.3], [-0.7, 2.0, 0.1]], dtype=torch.float64)
    targets = torch.tensor([0, 2])
    actual = FocalLoss(gamma=0.0, alpha=None, reduction="none")(logits, targets)
    expected = F.cross_entropy(logits, targets, reduction="none")
    assert torch.allclose(actual, expected)


def test_alpha_scales_only_the_correct_target_class() -> None:
    logits = torch.tensor([[2.0, -1.0, 0.5], [0.1, -0.4, 1.7]], dtype=torch.float64)
    targets = torch.tensor([0, 2])
    alpha = torch.tensor([0.25, 3.0, 2.0], dtype=torch.float64)
    actual = FocalLoss(gamma=0.0, alpha=alpha, reduction="none")(logits, targets)
    expected = F.cross_entropy(logits, targets, reduction="none") * alpha[targets]
    assert torch.allclose(actual, expected)


def test_pt_remains_true_target_probability_when_alpha_is_present() -> None:
    logits = torch.tensor([[1.0, 0.0, -1.0]], dtype=torch.float64)
    targets = torch.tensor([0])
    alpha = torch.tensor([10.0, 1.0, 1.0], dtype=torch.float64)
    actual = FocalLoss(gamma=2.0, alpha=alpha, reduction="none")(logits, targets)
    expected = _manual_focal(logits, targets, gamma=2.0, alpha=alpha)

    # This is the old incorrect formula: pt was exp(-weighted_ce).
    weighted_ce = F.cross_entropy(logits, targets, weight=alpha, reduction="none")
    wrong_pt = torch.exp(-weighted_ce)
    true_pt = F.softmax(logits, dim=1)[0, 0]

    assert torch.allclose(actual, expected)
    assert not torch.allclose(wrong_pt, true_pt)


def test_gradients_are_finite() -> None:
    logits = torch.randn(8, 5, requires_grad=True)
    targets = torch.tensor([0, 1, 2, 3, 4, 0, 1, 2])
    loss = FocalLoss(gamma=2.0, alpha=torch.ones(5))(logits, targets)
    loss.backward()
    assert logits.grad is not None
    assert torch.isfinite(logits.grad).all()


def test_cpu_and_cuda_agree_when_available() -> None:
    if not torch.cuda.is_available():
        pytest.skip("CUDA not available")
    logits = torch.randn(6, 4, dtype=torch.float32)
    targets = torch.tensor([0, 1, 2, 3, 1, 0])
    alpha = torch.tensor([0.5, 1.0, 2.0, 3.0])
    cpu = FocalLoss(gamma=1.5, alpha=alpha, reduction="none")(logits, targets)
    cuda = FocalLoss(gamma=1.5, alpha=alpha.cuda(), reduction="none")(
        logits.cuda(), targets.cuda()
    ).cpu()
    assert torch.allclose(cpu, cuda, atol=1e-6, rtol=1e-6)


def test_reduction_modes() -> None:
    logits = torch.tensor([[0.2, 1.1], [2.0, -0.3], [-0.5, 0.7]])
    targets = torch.tensor([1, 0, 1])
    unreduced = FocalLoss(gamma=2.0, reduction="none")(logits, targets)
    assert torch.allclose(FocalLoss(gamma=2.0, reduction="sum")(logits, targets), unreduced.sum())
    assert torch.allclose(FocalLoss(gamma=2.0, reduction="mean")(logits, targets), unreduced.mean())


def test_extreme_logits_do_not_produce_nans() -> None:
    logits = torch.tensor([[1000.0, -1000.0, 0.0], [-1000.0, 1000.0, 0.0]])
    targets = torch.tensor([0, 1])
    alpha = torch.tensor([1.0, 2.0, 3.0])
    loss = FocalLoss(gamma=2.0, alpha=alpha, reduction="none")(logits, targets)
    assert torch.isfinite(loss).all()


def test_stage_b_double_rebalancing_invariant() -> None:
    assert_single_stage_b_rebalancing(True, False)
    assert_single_stage_b_rebalancing(False, True)
    assert_single_stage_b_rebalancing(False, False)
    assert_single_stage_b_rebalancing(True, True, allow_legacy_double_rebalancing=True)
    with pytest.raises(ValueError, match="USE_WEIGHTED_SAMPLER_STAGE_B"):
        assert_single_stage_b_rebalancing(True, True)
