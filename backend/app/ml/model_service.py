"""
SHPMFS — Model-Serving Layer for FastAPI.
Loads the trained hybrid forecaster artifact and provides get_forecast().
"""

import logging
import sys
from pathlib import Path
from typing import Dict, List, Optional
import pandas as pd
import joblib

logger = logging.getLogger(__name__)

# Ensure unpickling finds _loss and DecoupledFleetForecaster
try:
    import sklearn._loss._loss
    sys.modules['_loss'] = sklearn._loss._loss
except Exception as e:
    logger.warning(f"Could not alias _loss: {e}")

from app.ml.shpmfs_model import DecoupledFleetForecaster, make_origin_features

import __main__
__main__.DecoupledFleetForecaster = DecoupledFleetForecaster
sys.modules['__main__'].DecoupledFleetForecaster = DecoupledFleetForecaster

MODEL_PATH = Path(__file__).parent / "shpmfs_hybrid_forecaster.joblib"

_artifact = None
MODEL = None
FEAT_COLS = None
PLANTS = None
CALIBRATION = None


def _load():
    """Load model artifact from disk."""
    global _artifact, MODEL, FEAT_COLS, PLANTS, CALIBRATION
    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model file not found at {MODEL_PATH}")
    
    _artifact = joblib.load(str(MODEL_PATH))
    MODEL = _artifact["model"]
    FEAT_COLS = _artifact["features"]
    PLANTS = _artifact["plants"]
    CALIBRATION = _artifact["calibration"]
    logger.info(f"SHPMFS Forecaster loaded successfully! Plants: {PLANTS}")


def reload_model(path: Optional[Path] = None):
    """Hot-reload model after retraining without server restart."""
    global MODEL_PATH
    if path:
        MODEL_PATH = path
    _load()


def _ensure_loaded():
    """Lazy load on first inference."""
    global MODEL
    if MODEL is None:
        _load()


def get_supported_plants() -> List[str]:
    """Returns list of plant names supported by the model."""
    _ensure_loaded()
    return PLANTS or []


def get_forecast(panel: pd.DataFrame, plant: str, origin_date: pd.Timestamp) -> List[Dict]:
    """
    Runs 7-day generation forecast for a given powerhouse.
    
    panel: DataFrame with columns:
      Power_Plant, Date, Generation_MW, Inflow_m3s, Capacity_MW, Outage_Flag,
      Canal_Closure_Log, Is_Observed
    
    Returns list of 7 dictionaries (horizons 1 to 7).
    """
    _ensure_loaded()

    if plant not in PLANTS:
        raise ValueError(f"Plant '{plant}' not recognized. Expected one of: {PLANTS}")

    df_feat = make_origin_features(panel, plant, origin_date, PLANTS)
    if df_feat.empty:
        return []

    preds, proba = MODEL.predict(df_feat)
    df_feat = df_feat.copy()
    df_feat["forecast_mw"] = preds
    df_feat["p_online"] = proba

    out = []
    for _, row in df_feat.iterrows():
        h = int(row["horizon"])
        cap = float(row["capacity_mw"])
        cal = CALIBRATION.get((plant, h), {"lower_norm": -0.10, "upper_norm": 0.10})

        fc_mw = round(float(row["forecast_mw"]), 2)
        p_on = round(float(row["p_online"]), 3)
        lower = round(max(0.0, fc_mw + cal["lower_norm"] * cap), 2)
        upper = round(min(cap, fc_mw + cal["upper_norm"] * cap), 2)

        out.append({
            "target_date": row["target_date"].strftime("%Y-%m-%d"),
            "horizon": h,
            "forecast_mw": fc_mw,
            "pi80_lower_mw": lower,
            "pi80_upper_mw": upper,
            "p_online": p_on,
        })

    return out
