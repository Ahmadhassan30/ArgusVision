"""Frozen scientific constants for the PairRisk study."""

CLASS_ORDER = ("MEL", "NV", "BCC", "AK", "BKL", "DF", "VASC", "SCC")
RANDOM_SEED = 2026
PRIMARY_ALPHA = 0.10
DESIGN_FRACTION = 0.40
LME_TAU_GRID = (0.02, 0.05, 0.10, 0.20, 0.50, 1.00)
GLOBAL_LME_TAU = 0.05

PROBABILITY_COLUMNS = tuple(f"ensemble_probability_{name}" for name in CLASS_ORDER)
REQUIRED_COLUMNS = (
    "image",
    "lesion_group",
    "lesion_id",
    "label",
    "label_name",
    *PROBABILITY_COLUMNS,
)
