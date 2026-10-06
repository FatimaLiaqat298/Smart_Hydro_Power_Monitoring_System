import logging
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
from fastapi import HTTPException, status
import pandas as pd

from app.db.supabase import postgrest_get, postgrest_post
from app.schemas.forecast import (
    ForecastResultResponse, ForecastRunRequest, ForecastRunResponse,
    PlantForecastResponse, ForecastPoint
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# DB Panel Loader
# ─────────────────────────────────────────────────────────────────────────────

async def _build_panel_for_plant(plant_name: str, powerhouse_id: str) -> pd.DataFrame:
    """
    Fetches trailing 40 days of daily generation for a single powerhouse
    and returns a panel DataFrame formatted for make_origin_features().
    """
    params = {
        "powerhouse_id": f"eq.{powerhouse_id}",
        "select": "reading_date,avg_station_load_mw,actual_avg_inflow_cumecs,outage_flag,canal_closure_flag",
        "order": "reading_date.desc",
        "limit": "40"
    }
    rows = await postgrest_get("generation_records", params)

    # Fetch powerhouse capacity
    ph_rows = await postgrest_get("powerhouses", {"id": f"eq.{powerhouse_id}", "select": "installed_capacity_mw"})
    capacity = float(ph_rows[0]["installed_capacity_mw"]) if ph_rows else 1.0

    if not rows:
        return pd.DataFrame()

    records = []
    for r in rows:
        records.append({
            "Power_Plant": plant_name,
            "Date": pd.Timestamp(r["reading_date"]),
            "Generation_MW": float(r.get("avg_station_load_mw") or 0.0),
            "Inflow_m3s": float(r.get("actual_avg_inflow_cumecs") or 0.0),
            "Capacity_MW": capacity,
            "Outage_Flag": int(bool(r.get("outage_flag", False))),
            "Canal_Closure_Log": int(bool(r.get("canal_closure_flag", False))),
            "Is_Observed": 1,
        })

    df = pd.DataFrame(records).sort_values("Date").reset_index(drop=True)
    return df


# ─────────────────────────────────────────────────────────────────────────────
# Live 7-Day Forecast (On-Demand)
# ─────────────────────────────────────────────────────────────────────────────

async def get_live_forecast_for_plant(plant_name: str, powerhouse_id: str) -> Dict:
    """
    Returns live 7-day forecast from the last observed reading date for a plant.
    Also returns recent 14 days of historical actuals for chart visualization.
    """
    from app.ml.model_service import get_forecast, get_supported_plants

    supported = get_supported_plants()
    if plant_name not in supported:
        return {
            "plant": plant_name,
            "powerhouse_id": powerhouse_id,
            "origin_date": None,
            "history": [],
            "forecast": [],
            "error": f"Plant '{plant_name}' is not in the ML model training set. Supported: {supported}"
        }

    panel = await _build_panel_for_plant(plant_name, powerhouse_id)
    if panel.empty:
        return {
            "plant": plant_name,
            "powerhouse_id": powerhouse_id,
            "origin_date": None,
            "history": [],
            "forecast": [],
            "error": "No generation records found for this plant."
        }

    origin_date = panel["Date"].max()

    try:
        forecasts = get_forecast(panel, plant_name, origin_date)
    except Exception as e:
        logger.error(f"Inference error for {plant_name}: {e}")
        return {
            "plant": plant_name,
            "powerhouse_id": powerhouse_id,
            "origin_date": origin_date.strftime("%Y-%m-%d"),
            "history": [],
            "forecast": [],
            "error": f"Forecast model error: {str(e)}"
        }

    # Format historical summary (last 14 days)
    recent = panel.tail(14)
    history = []
    for _, row in recent.iterrows():
        history.append({
            "date": row["Date"].strftime("%Y-%m-%d"),
            "actual_mw": round(float(row["Generation_MW"]), 2),
            "inflow_m3s": round(float(row["Inflow_m3s"]), 2),
        })

    return {
        "plant": plant_name,
        "powerhouse_id": powerhouse_id,
        "origin_date": origin_date.strftime("%Y-%m-%d"),
        "history": history,
        "forecast": forecasts,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Batch Forecast Run (Save to DB)
# ─────────────────────────────────────────────────────────────────────────────

async def run_forecast(run_req: ForecastRunRequest) -> ForecastRunResponse:
    """
    Executes forecast for selected powerhouse(s) and persists results into forecast_results table.
    """
    from app.ml.model_service import get_forecast, get_supported_plants

    supported = get_supported_plants()
    ph_rows = await postgrest_get("powerhouses", {"select": "id,name", "order": "name.asc"})
    
    if run_req.powerhouse_id:
        ph_rows = [r for r in ph_rows if str(r["id"]) == str(run_req.powerhouse_id)]

    if not ph_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching powerhouse found")

    saved = 0
    processed = 0

    for ph in ph_rows:
        plant_name = ph["name"]
        ph_id = str(ph["id"])

        if plant_name not in supported:
            logger.info(f"Skipping '{plant_name}' — not in model list")
            continue

        panel = await _build_panel_for_plant(plant_name, ph_id)
        if panel.empty:
            continue

        origin_date = panel["Date"].max()
        try:
            forecasts = get_forecast(panel, plant_name, origin_date)
            for fc in forecasts:
                db_payload = {
                    "powerhouse_id": ph_id,
                    "origin_date": origin_date.strftime("%Y-%m-%d"),
                    "target_date": fc["target_date"],
                    "horizon_days": fc["horizon"],
                    "predicted_mw": fc["forecast_mw"],
                    "pi80_lower_mw": fc["pi80_lower_mw"],
                    "pi80_upper_mw": fc["pi80_upper_mw"],
                    "p_online": fc["p_online"],
                    "model_version": "shpmfs_hybrid_v1",
                    "scenario": "median_inflow"
                }
                try:
                    await postgrest_post("forecast_results", db_payload)
                    saved += 1
                except Exception as e:
                    logger.warning(f"Duplicate/insert warning for forecast {plant_name} {fc['target_date']}: {e}")
            processed += 1
        except Exception as e:
            logger.error(f"Failed forecast run for {plant_name}: {e}")

    return ForecastRunResponse(
        status="completed",
        origin_date=run_req.origin_date.isoformat(),
        horizon_days=7,
        powerhouses_processed=processed,
        records_saved=saved,
        message=f"Forecast run complete: {saved} records saved for {processed} powerhouses."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Stored Forecasts Queries
# ─────────────────────────────────────────────────────────────────────────────

async def list_forecasts(
    powerhouse_id: Optional[UUID] = None,
    origin_date: Optional[str] = None,
    target_date: Optional[str] = None,
    horizon_days: Optional[int] = None,
    page: int = 1,
    page_size: int = 50
) -> Tuple[List[ForecastResultResponse], int]:
    params: Dict[str, Any] = {
        "select": "*,powerhouses(name)",
        "order": "target_date.asc,created_at.desc",
        "limit": str(page_size),
        "offset": str((page - 1) * page_size)
    }
    count_p: Dict[str, Any] = {"select": "id"}
    if powerhouse_id:
        params["powerhouse_id"] = f"eq.{str(powerhouse_id)}"
        count_p["powerhouse_id"] = f"eq.{str(powerhouse_id)}"
    if origin_date:
        params["origin_date"] = f"eq.{origin_date}"
        count_p["origin_date"] = f"eq.{origin_date}"
    if target_date:
        params["target_date"] = f"eq.{target_date}"
    if horizon_days:
        params["horizon_days"] = f"eq.{horizon_days}"

    data = await postgrest_get("forecast_results", params)
    total = len(await postgrest_get("forecast_results", count_p))

    results = []
    for item in data:
        ph_info = item.pop("powerhouses", None)
        item["powerhouse_name"] = ph_info.get("name") if isinstance(ph_info, dict) else None
        results.append(ForecastResultResponse(**item))

    return results, total


async def get_forecast_by_id(forecast_id: UUID) -> ForecastResultResponse:
    data = await postgrest_get("forecast_results", {"id": f"eq.{str(forecast_id)}", "select": "*,powerhouses(name)"})
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Forecast not found")
    item = data[0]
    ph_info = item.pop("powerhouses", None)
    item["powerhouse_name"] = ph_info.get("name") if isinstance(ph_info, dict) else None
    return ForecastResultResponse(**item)
