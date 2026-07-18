import numpy as np

from multiview_conformal.conformal import aps_scores, calibrate_quantile, prediction_sets


def test_aps_known_example():
    probs = np.array([[0.5, 0.3, 0.2]])
    scores = aps_scores(probs)
    np.testing.assert_allclose(scores, [[0.5, 0.8, 1.0]])


def test_aps_stable_tie_order():
    probs = np.array([[0.4, 0.4, 0.2]])
    scores = aps_scores(probs)
    np.testing.assert_allclose(scores, [[0.4, 0.8, 1.0]])


def test_finite_sample_quantile():
    scores = np.arange(1, 11) / 10
    # n=10, alpha=.2 => ceil(11*.8)=9 => ninth order statistic .9
    assert calibrate_quantile(scores, 0.2) == 0.9


def test_infinite_quantile_for_tiny_calibration():
    scores = np.arange(1, 9) / 10
    assert np.isinf(calibrate_quantile(scores, 0.1))


def test_prediction_sets():
    scores = np.array([[0.2, 0.8], [0.6, 0.4]])
    sets = prediction_sets(scores, 0.5)
    np.testing.assert_array_equal(sets, [[True, False], [False, True]])
