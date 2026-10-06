"""
Standalone inference runner for the SHPMFS Hybrid ML model.
Reads JSON from stdin, runs inference, writes JSON to stdout.

This version uses ONLY numpy + scikit-learn (no pandas) for compatibility
with Windows Application Control policies that block pandas DLLs.
The feature engineering from make_origin_features() is reimplemented
using pure Python + numpy.
"""
import sys
import json
import math
import datetime
from pathlib import Path

ML_DIR = Path(__file__).parent
sys.path.insert(0, str(ML_DIR))

try:
    import numpy as np
except ImportError as e:
    print(json.dumps({"error": f"numpy not installed: {e}", "forecasts": []}))
    sys.exit(0)

try:
    import joblib
except ImportError as e:
    print(json.dumps({"error": f"joblib not installed: {e}", "forecasts": []}))
    sys.exit(0)

# ── Constants from shpmfs_model.py ────────────────────────────────────────────
HORIZONS = list(range(1, 8))
LEGACY_REGRESSOR_PLANTS = ["Daral Khwar HPS", "Karora HPS", "Koto HPS", "Jabori HPS", "Reshun HPS"]
SOLO_REGRESSOR_PLANTS = ["Malakand-3 HPS"]
HYBRID_HURDLE_PLANTS = ["Machai HPS", "Pehur HPS"]
CANAL_INFRASTRUCTURE_PLANTS = ["Pehur HPS", "Machai HPS", "Malakand-3 HPS"]

FEATURES = [
    "horizon", "capacity_mw", "scenario_inflow_m3s",
    "gen_lag_1", "gen_lag_7", "gen_mean_7", "gen_mean_28", "gen_std_7",
    "inflow_lag_1", "inflow_mean_7", "inflow_mean_28",
    "recent_outage", "outage_days_28",
    "is_closure_season", "closure_log_recent",
    "day_of_week", "month", "season_sin", "season_cos",
]


def _rolling_mean(lst, n):
    tail = lst[-n:] if len(lst) >= n else lst
    return float(np.mean(tail)) if tail else 0.0


def _rolling_std(lst, n):
    tail = lst[-n:] if len(lst) >= n else lst
    return float(np.std(tail)) if len(tail) > 1 else 0.0


def _rolling_max(lst, n):
    tail = lst[-n:] if len(lst) >= n else lst
    return max(tail) if tail else 0


def _rolling_sum(lst, n):
    tail = lst[-n:] if len(lst) >= n else lst
    return sum(tail) if tail else 0


def make_features_numpy(rows: list, plant: str, origin_date_str: str, plants: list, feat_cols: list) -> np.ndarray:
    """
    Replicate make_origin_features() using pure Python + numpy.
    rows: sorted list of dicts (ascending by Date), filtered to this plant, up to origin_date
    feat_cols: feature column list from the model artifact
    Returns a (7, len(feat_cols)) numpy array — one row per horizon.
    """
    if not rows:
        return np.array([])

    gen = [float(r.get("Generation_MW", 0) or 0) for r in rows]
    inf = [float(r.get("Inflow_m3s", 0) or 0) for r in rows]
    out_flags = [int(r.get("Outage_Flag", 0) or 0) for r in rows]
    closure_flags = [int(r.get("Canal_Closure_Log", 0) or 0) for r in rows]
    cap = float(rows[-1].get("Capacity_MW", 1) or 1)

    origin_date = datetime.date.fromisoformat(origin_date_str[:10])

    # Inflow scenario: median of last 28 days
    inf_val = float(np.median(inf[-28:])) if inf else 0.0

    # Closure season: Jan-Feb + canal infra + gen was 0 seven days ago
    is_jan_feb = int(origin_date.month in [1, 2])
    is_canal_infra = int(plant in CANAL_INFRASTRUCTURE_PLANTS)
    gen_7_val = gen[-7] if len(gen) >= 7 else gen[0]
    is_closure_season = is_jan_feb * is_canal_infra * int(gen_7_val == 0.0)
    closure_recent = _rolling_max(closure_flags, 14)

    feature_rows = []
    for h in HORIZONS:
        td = origin_date + datetime.timedelta(days=h)
        day_of_year = td.timetuple().tm_yday

        base = {
            "horizon": h,
            "capacity_mw": cap,
            "scenario_inflow_m3s": inf_val,
            "gen_lag_1": gen[-1] if gen else 0.0,
            "gen_lag_7": gen[-7] if len(gen) >= 7 else (gen[0] if gen else 0.0),
            "gen_mean_7": _rolling_mean(gen, 7),
            "gen_mean_28": _rolling_mean(gen, 28),
            "gen_std_7": _rolling_std(gen, 7),
            "inflow_lag_1": inf[-1] if inf else 0.0,
            "inflow_mean_7": _rolling_mean(inf, 7),
            "inflow_mean_28": _rolling_mean(inf, 28),
            "recent_outage": _rolling_max(out_flags, 7),
            "outage_days_28": _rolling_sum(out_flags, 28),
            "is_closure_season": is_closure_season,
            "closure_log_recent": closure_recent,
            "day_of_week": td.weekday(),
            "month": td.month,
            "season_sin": math.sin(2 * math.pi * day_of_year / 365.25),
            "season_cos": math.cos(2 * math.pi * day_of_year / 365.25),
        }
        # Plant one-hot columns
        for pl in plants:
            base[f"plant_{pl}"] = int(plant == pl)

        feature_rows.append(base)

    # Build numpy array in the exact column order expected by the model
    X = np.array([[row.get(col, 0.0) for col in feat_cols] for row in feature_rows], dtype=float)
    return X, feature_rows


def predict(model, X: np.ndarray, feature_rows: list, plants_list: list, plant: str, caps: np.ndarray):
    """
    Replicates DecoupledFleetForecaster.predict() logic using the internal sklearn models.
    """
    n = len(feature_rows)
    preds = np.zeros(n, dtype=float)
    final_proba = np.ones(n, dtype=float)

    # Build solo feature matrix (no plant_ one-hot columns)
    solo_feat_cols = model.solo_feature_cols
    X_solo = np.array([[row.get(col, 0.0) for col in solo_feat_cols] for row in feature_rows], dtype=float)

    # Get raw predictions from each sub-model
    raw_legacy = np.clip(model.reg_legacy.predict(X), 0.0, caps)
    raw_solo = np.clip(model.reg_solo.predict(X_solo), 0.0, caps)
    raw_hybrid = np.clip(model.reg_hybrid.predict(X), 0.0, caps)
    p_online_hyb = model.clf_hybrid.predict_proba(X)[:, 1]

    for i, row in enumerate(feature_rows):
        cap = caps[i]
        gen_lag_1 = row.get("gen_lag_1", 0.0)
        outage_days_28 = row.get("outage_days_28", 0)
        is_closure = row.get("is_closure_season", 0)
        closure_recent = row.get("closure_log_recent", 0)

        if plant in LEGACY_REGRESSOR_PLANTS:
            is_extended_outage = (outage_days_28 >= 14) and (gen_lag_1 == 0.0)
            if is_extended_outage:
                preds[i] = 0.0
                final_proba[i] = 0.0
            else:
                preds[i] = raw_legacy[i]
                final_proba[i] = 1.0
            continue

        if plant in SOLO_REGRESSOR_PLANTS:
            in_canal_shut = (is_closure == 1 or closure_recent == 1) and (gen_lag_1 == 0.0)
            is_extended_outage = (outage_days_28 >= 14) and (gen_lag_1 == 0.0)
            if in_canal_shut or is_extended_outage:
                preds[i] = 0.0
                final_proba[i] = 0.0
            else:
                preds[i] = raw_solo[i]
                final_proba[i] = 1.0
            continue

        # Hybrid hurdle
        if gen_lag_1 > 0.05:
            preds[i] = raw_hybrid[i]
            final_proba[i] = 1.0
            continue

        is_maint = (outage_days_28 >= 7) and (gen_lag_1 == 0.0)
        in_closure = (
            (plant in CANAL_INFRASTRUCTURE_PLANTS)
            and (is_closure == 1 or closure_recent == 1)
            and (gen_lag_1 == 0.0)
        )
        if is_maint or in_closure:
            preds[i] = 0.0
            final_proba[i] = 0.0
            continue

        final_proba[i] = p_online_hyb[i]
        if p_online_hyb[i] >= model.proba_threshold:
            preds[i] = raw_hybrid[i]
        else:
            preds[i] = 0.0

    return preds, final_proba


def run(input_data: dict) -> dict:
    plant = input_data["plant"]
    rows = input_data.get("rows", [])
    origin_date_str = input_data.get("origin_date", "")

    # Load model
    try:
        artifact = joblib.load(str(MODEL_PATH))
        model = artifact["model"]
        plants = artifact["plants"]
        feat_cols = artifact["features"]
        calibration = artifact["calibration"]
    except Exception as e:
        return {"error": f"Model load failed: {e}", "forecasts": []}

    # Probe request: return plant list
    if plant == "__probe__":
        return {"error": f"Supported: {json.dumps(plants)}", "forecasts": []}

    if plant not in plants:
        return {"error": f"Plant '{plant}' not in model. Supported: {plants}", "forecasts": []}

    if not rows:
        return {"error": "No historical rows provided", "forecasts": []}

    # Build feature matrix
    try:
        X, feature_rows = make_features_numpy(rows, plant, origin_date_str, plants, feat_cols)
    except Exception as e:
        return {"error": f"Feature engineering failed: {e}", "forecasts": []}

    if X is None or len(X) == 0:
        return {"error": "Insufficient history for forecast (need ≥28 days of data)", "forecasts": []}

    # Get capacity per row
    cap_val = float(rows[-1].get("Capacity_MW", 1) or 1)
    caps = np.full(len(feature_rows), cap_val)

    # Run prediction
    try:
        preds, proba = predict(model, X, feature_rows, plants, plant, caps)
    except Exception as e:
        return {"error": f"Model inference failed: {e}", "forecasts": []}

    # Build output
    origin_date = datetime.date.fromisoformat(origin_date_str[:10])
    out = []
    for i, h in enumerate(HORIZONS):
        target_date = origin_date + datetime.timedelta(days=h)
        cal = calibration.get((plant, h), {"lower_norm": -0.10, "upper_norm": 0.10})
        fc_mw = float(preds[i])
        out.append({
            "target_date": target_date.isoformat(),
            "horizon": h,
            "forecast_mw": round(fc_mw, 2),
            "pi80_lower_mw": round(max(0.0, fc_mw + cal["lower_norm"] * cap_val), 2),
            "pi80_upper_mw": round(min(cap_val, fc_mw + cal["upper_norm"] * cap_val), 2),
            "p_online": round(float(proba[i]), 3),
        })

    return {"error": None, "forecasts": out}


if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        result = run(input_data)
    except Exception as e:
        result = {"error": str(e), "forecasts": []}
    print(json.dumps(result))
