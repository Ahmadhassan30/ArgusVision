import numpy as np
import pytest

from multiview_conformal.aggregators import (
    logmeanexp_scores,
    max_scores,
    mean_scores,
    pairrisk_decomposition,
    pairrisk_scores,
    pairrisk_scores_bruteforce,
)


def random_scores(seed=11, views=7, classes=8):
    return np.random.default_rng(seed).uniform(0.0, 1.0, size=(views, classes))


def test_pairrisk_permutation_invariance():
    scores = random_scores()
    permuted = scores[[4, 0, 6, 1, 5, 2, 3]]
    np.testing.assert_allclose(pairrisk_scores(scores), pairrisk_scores(permuted))


def test_pairrisk_two_views_equals_maximum():
    scores = random_scores(views=2)
    np.testing.assert_allclose(pairrisk_scores(scores), max_scores(scores))


def test_pairrisk_constant_identity():
    scores = np.full((9, 8), 0.37)
    np.testing.assert_allclose(pairrisk_scores(scores), np.full(8, 0.37))


def test_pairrisk_bounds():
    scores = random_scores()
    pair = pairrisk_scores(scores)
    assert np.all(pair >= mean_scores(scores) - 1e-12)
    assert np.all(pair <= max_scores(scores) + 1e-12)


def test_pairrisk_decomposition_identity():
    scores = random_scores()
    pair, mean, penalty = pairrisk_decomposition(scores)
    np.testing.assert_allclose(pair, pairrisk_scores(scores), atol=1e-12)
    np.testing.assert_allclose(pair, mean + penalty, atol=1e-12)


def test_pairrisk_sorted_equals_bruteforce():
    scores = random_scores(views=12)
    np.testing.assert_allclose(
        pairrisk_scores(scores), pairrisk_scores_bruteforce(scores), atol=1e-12
    )


def test_pairrisk_requires_two_views():
    with pytest.raises(ValueError):
        pairrisk_scores(np.ones((1, 8)))


def test_logmeanexp_permutation_invariance():
    scores = random_scores()
    np.testing.assert_allclose(
        logmeanexp_scores(scores, 0.2), logmeanexp_scores(scores[::-1], 0.2)
    )


def test_logmeanexp_between_mean_and_max():
    scores = random_scores()
    lme = logmeanexp_scores(scores, 0.2)
    assert np.all(lme >= mean_scores(scores) - 1e-12)
    assert np.all(lme <= max_scores(scores) + 1e-12)


def test_logmeanexp_limits():
    scores = random_scores()
    np.testing.assert_allclose(logmeanexp_scores(scores, 1e-5), max_scores(scores), atol=1e-4)
    np.testing.assert_allclose(logmeanexp_scores(scores, 1e5), mean_scores(scores), atol=1e-5)
