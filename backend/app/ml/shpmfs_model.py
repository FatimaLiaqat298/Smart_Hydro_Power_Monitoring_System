# -*- coding: utf-8 -*-
"""
SHPMFS Model Module (shpmfs_model.py)
-------------------------------------
Provides the model classes, feature engineering, and inference routines
required by model_service.py and FastAPI routes.
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor

HORIZONS = list(range(1, 8))

LEGACY_REGRESSOR_PLANTS = [
    "Daral Khwar HPS",
    "Karora HPS",
    "Koto HPS",
    "Jabori HPS",
    "Reshun HPS",
]
SOLO_REGRESSOR_PLANTS = [
    "Malakand-3 HPS",
]
HYBRID_HURDLE_PLANTS = [
    "Machai HPS",
    "Pehur HPS",
]
CANAL_INFRASTRUCTURE_PLANTS = ["Pehur HPS", "Machai HPS", "Malakand-3 HPS"]

FEATURES = [
    "horizon",
    "capacity_mw",
    "scenario_inflow_m3s",
    "gen_lag_1",
    "gen_lag_7",
    "gen_mean_7",
    "gen_mean_28",
    "gen_std_7",
    "inflow_lag_1",
    "inflow_mean_7",
    "inflow_mean_28",
    "recent_outage",
    "outage_days_28",
    "is_closure_season",
    "closure_log_recent",
    "day_of_week",
    "month",
    "season_sin",
    "season_cos",
]


class DecoupledFleetForecaster:
    """
    Decoupled Model Architecture:
      - Model A (Legacy Regressor): Pooled continuous GBDT for mid-scale baseload.
      - Model S (Solo Regressor): Isolated continuous GBDT for Malakand-3 (81 MW).
      - Model B (Hurdle Pipeline): GBDT Classifier + Active Regressor for intermittent stations.
    """
    def __init__(self, proba_threshold=0.35, max_iter=300):
        self.proba_threshold = proba_threshold

        self.reg_legacy = HistGradientBoostingRegressor(
            max_iter=max_iter,
            learning_rate=0.05,
            max_leaf_nodes=40,
            min_samples_leaf=20,
            l2_regularization=0.5,
            early_stopping=True,
            validation_fraction=0.10,
            n_iter_no_change=15,
            random_state=42,
        )

        self.reg_solo = HistGradientBoostingRegressor(
            max_iter=max_iter,
            learning_rate=0.05,
            max_leaf_nodes=40,
            min_samples_leaf=20,
            l2_regularization=0.5,
            early_stopping=True,
            validation_fraction=0.10,
            n_iter_no_change=15,
            random_state=42,
        )

        self.clf_hybrid = HistGradientBoostingClassifier(
            max_iter=max_iter,
            learning_rate=0.05,
            max_leaf_nodes=31,
            min_samples_leaf=15,
            l2_regularization=1.5,
            class_weight="balanced",
            early_stopping=True,
            validation_fraction=0.10,
            n_iter_no_change=15,
            random_state=42,
        )

        self.reg_hybrid = HistGradientBoostingRegressor(
            max_iter=max_iter,
            learning_rate=0.05,
            max_leaf_nodes=31,
            min_samples_leaf=15,
            l2_regularization=1.0,
            early_stopping=True,
            validation_fraction=0.10,
            n_iter_no_change=15,
            random_state=42,
        )
        self.feature_cols = None
        self.solo_feature_cols = None

    def fit(self, train_df, feature_cols):
        self.feature_cols = feature_cols
        self.solo_feature_cols = [c for c in feature_cols if not c.startswith("plant_")]

        df_leg = train_df[train_df["plant"].isin(LEGACY_REGRESSOR_PLANTS)]
        if len(df_leg) > 0:
            self.reg_legacy.fit(df_leg[self.feature_cols], df_leg["target_mw"])

        df_solo = train_df[train_df["plant"].isin(SOLO_REGRESSOR_PLANTS)]
        if len(df_solo) > 0:
            self.reg_solo.fit(df_solo[self.solo_feature_cols], df_solo["target_mw"])

        df_hyb = train_df[train_df["plant"].isin(HYBRID_HURDLE_PLANTS)]
        if len(df_hyb) > 0:
            X_hyb = df_hyb[self.feature_cols]
            y_hyb = df_hyb["target_mw"]

            y_bin = (y_hyb > np.maximum(df_hyb["capacity_mw"] * 0.03, 0.05)).astype(int)
            self.clf_hybrid.fit(X_hyb, y_bin)

            active_mask = (y_bin == 1)
            if active_mask.sum() > 30:
                self.reg_hybrid.fit(X_hyb.loc[active_mask], y_hyb.loc[active_mask])
            else:
                self.reg_hybrid.fit(X_hyb, y_hyb)

        return self

    def predict(self, df):
        X = df[self.feature_cols]
        X_solo = df[self.solo_feature_cols]
        caps = df["capacity_mw"].values
        plants = df["plant"].values if "plant" in df.columns else df["Power_Plant"].values

        raw_legacy = np.clip(self.reg_legacy.predict(X), 0.0, caps)
        raw_solo = np.clip(self.reg_solo.predict(X_solo), 0.0, caps)
        raw_hybrid = np.clip(self.reg_hybrid.predict(X), 0.0, caps)
        p_online_hyb = self.clf_hybrid.predict_proba(X)[:, 1]

        preds = np.zeros(len(df), dtype=float)
        final_proba = np.ones(len(df), dtype=float)

        for i in range(len(df)):
            p_name = plants[i]

            # Group A: Legacy Regressor
            if p_name in LEGACY_REGRESSOR_PLANTS:
                is_extended_outage = (df["outage_days_28"].iloc[i] >= 14) and (df["gen_lag_1"].iloc[i] == 0.0)
                if is_extended_outage:
                    preds[i] = 0.0
                    final_proba[i] = 0.0
                else:
                    preds[i] = raw_legacy[i]
                    final_proba[i] = 1.0
                continue

            # Group S: Solo Regressor (Malakand-3)
            if p_name in SOLO_REGRESSOR_PLANTS:
                in_canal_shut = (
                    (df["is_closure_season"].iloc[i] == 1 or df["closure_log_recent"].iloc[i] == 1)
                    and (df["gen_lag_1"].iloc[i] == 0.0)
                )
                is_extended_outage = (df["outage_days_28"].iloc[i] >= 14) and (df["gen_lag_1"].iloc[i] == 0.0)

                if in_canal_shut or is_extended_outage:
                    preds[i] = 0.0
                    final_proba[i] = 0.0
                else:
                    preds[i] = raw_solo[i]
                    final_proba[i] = 1.0
                continue

            # Group B: Hurdle Pipeline (Machai & Pehur)
            if df["gen_lag_1"].iloc[i] > 0.05:
                preds[i] = raw_hybrid[i]
                final_proba[i] = 1.0
                continue

            is_maint = (df["outage_days_28"].iloc[i] >= 7) and (df["gen_lag_1"].iloc[i] == 0.0)
            in_closure = (
                (p_name in CANAL_INFRASTRUCTURE_PLANTS)
                and (df["is_closure_season"].iloc[i] == 1 or df["closure_log_recent"].iloc[i] == 1)
                and (df["gen_lag_1"].iloc[i] == 0.0)
            )

            if is_maint or in_closure:
                preds[i] = 0.0
                final_proba[i] = 0.0
                continue

            final_proba[i] = p_online_hyb[i]
            if p_online_hyb[i] >= self.proba_threshold:
                preds[i] = raw_hybrid[i]
            else:
                preds[i] = 0.0

        return preds, final_proba


def make_origin_features(panel: pd.DataFrame, plant: str, origin_date: pd.Timestamp, plants: list, scenario_inflow=None) -> pd.DataFrame:
    """
    Builds the 7-horizon feature matrix for a specific plant as of origin_date.
    """
    p_hist = panel[
        (panel["Power_Plant"] == plant)
        & (panel["Date"] <= origin_date)
        & (panel["Is_Observed"] == 1)
    ].sort_values("Date")

    if p_hist.empty:
        return pd.DataFrame()

    gen = p_hist["Generation_MW"].astype(float)
    inf = p_hist["Inflow_m3s"].astype(float)
    cap = float(p_hist["Capacity_MW"].iloc[-1])
    inf_val = scenario_inflow if scenario_inflow is not None else float(inf.tail(28).median())

    is_jan_feb = int(origin_date.month in [1, 2])
    is_canal_infra = int(plant in CANAL_INFRASTRUCTURE_PLANTS)
    gen_7_val = float(gen.iloc[-7]) if len(gen) >= 7 else float(gen.iloc[0])
    is_closure_season = is_jan_feb * is_canal_infra * int(gen_7_val == 0.0)
    closure_recent = int(p_hist["Canal_Closure_Log"].tail(14).max())

    rows = []
    for h in HORIZONS:
        td = origin_date + pd.Timedelta(days=h)
        r = {
            "plant": plant,
            "origin_date": origin_date,
            "target_date": td,
            "horizon": h,
            "capacity_mw": cap,
            "scenario_inflow_m3s": inf_val,
            "gen_lag_1": float(gen.iloc[-1]),
            "gen_lag_7": gen_7_val,
            "gen_mean_7": float(gen.tail(7).mean()),
            "gen_mean_28": float(gen.tail(28).mean()),
            "gen_std_7": float(gen.tail(7).std(ddof=0)),
            "inflow_lag_1": float(inf.iloc[-1]),
            "inflow_mean_7": float(inf.tail(7).mean()),
            "inflow_mean_28": float(inf.tail(28).mean()),
            "recent_outage": int(p_hist["Outage_Flag"].tail(7).max()),
            "outage_days_28": int(p_hist["Outage_Flag"].tail(28).sum()),
            "is_closure_season": is_closure_season,
            "closure_log_recent": closure_recent,
            "day_of_week": td.dayofweek,
            "month": td.month,
            "season_sin": np.sin(2 * np.pi * td.dayofyear / 365.25),
            "season_cos": np.cos(2 * np.pi * td.dayofyear / 365.25),
        }
        for pl in plants:
            r[f"plant_{pl}"] = int(plant == pl)
        rows.append(r)

    return pd.DataFrame(rows)