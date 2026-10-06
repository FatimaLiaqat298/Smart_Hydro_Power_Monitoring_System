import logging
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
from decimal import Decimal
from fastapi import HTTPException, status
from app.core.config import settings
from app.db.supabase import postgrest_get, postgrest_post, postgrest_patch
from app.schemas.anomaly import AnomalyResponse, AnomalySeverity
from app.schemas.user import UserRole
from app.services.activity_log_service import log_activity
from app.services.notification_service import create_notification_for_users

logger = logging.getLogger(__name__)

OUTAGE_KEYWORDS = ["shutdown", "outage", "canal closure", "closed", "tower", "nil demand", "trip"]


def _generate_root_cause_insight(
    actual_mw: float, predicted_mw: float, error_pct: float, remarks: Optional[str]
) -> str:
    """
    Rule-based analytical root cause estimation.
    This is NOT a guaranteed real-world cause — it is an analytical estimate based on available data.
    """
    insight_parts = []
    if remarks:
        rmarks_lower = remarks.lower()
        for kw in OUTAGE_KEYWORDS:
            if kw in rmarks_lower:
                insight_parts.append(f"Remarks indicate possible outage/operational issue: '{remarks[:100]}'.")
                break
    if actual_mw < predicted_mw:
        if error_pct > 40:
            insight_parts.append(f"Severe under-generation ({error_pct:.1f}% below forecast). Likely operational disruption or significant inflow reduction.")
        elif error_pct > 20:
            insight_parts.append(f"Notable under-generation ({error_pct:.1f}% below forecast). Possible reduced inflow or partial outage.")
    else:
        insight_parts.append(f"Over-generation ({abs(error_pct):.1f}% above forecast). Possible improved hydrology conditions or forecast underestimation.")

    disclaimer = "Note: This is an analytical estimate based on deviation patterns and remarks. It does not represent a confirmed operational root cause."
    return " ".join(insight_parts) + " " + disclaimer if insight_parts else disclaimer


async def evaluate_and_create_anomaly(generation_record: Dict[str, Any], powerhouse: Any) -> None:
    """
    Checks if a newly saved generation record deviates from any existing forecast for the same date.
    Creates anomaly_alert if sigma or band breach criteria are met.
    """
    rec_date = generation_record.get("reading_date")
    ph_id = generation_record.get("powerhouse_id")
    actual_mw = float(generation_record.get("avg_station_load_mw") or 0)
    remarks = generation_record.get("remarks")

    # Fetch matching forecast
    forecasts = await postgrest_get("forecast_results", {
        "powerhouse_id": f"eq.{ph_id}",
        "target_date": f"eq.{rec_date}"
    })
    if not forecasts:
        return  # No forecast for this date — no anomaly check possible

    forecast = forecasts[0]
    predicted_mw = float(forecast.get("predicted_mw") or 0)
    pi80_lower = float(forecast.get("pi80_lower_mw") or 0)
    pi80_upper = float(forecast.get("pi80_upper_mw") or 0)
    sigma_threshold = float(forecast.get("sigma_threshold_mw") or 0)

    if predicted_mw == 0:
        return

    error_mw = actual_mw - predicted_mw
    error_pct = abs(error_mw / predicted_mw * 100)

    # Determine if anomaly criteria breached
    is_band_breach = (pi80_lower > 0 and pi80_upper > 0) and (actual_mw < pi80_lower or actual_mw > pi80_upper)
    is_sigma_alert = sigma_threshold > 0 and abs(error_mw) > sigma_threshold
    threshold_pct = settings.SIGMA_ALERT_THRESHOLD_PCT
    is_pct_breach = error_pct > threshold_pct

    if not (is_band_breach or is_sigma_alert or is_pct_breach):
        return  # No anomaly

    severity = AnomalySeverity.BAND_BREACH.value if is_band_breach else AnomalySeverity.SIGMA_ALERT.value
    confidence = round(min(0.95, 0.5 + (error_pct / 200)), 3)
    root_cause = _generate_root_cause_insight(actual_mw, predicted_mw, error_pct, remarks)

    anomaly_payload = {
        "powerhouse_id": ph_id,
        "generation_record_id": generation_record["id"],
        "forecast_result_id": forecast["id"],
        "anomaly_date": rec_date,
        "actual_mw": actual_mw,
        "predicted_mw": predicted_mw,
        "error_mw": round(error_mw, 3),
        "severity": severity,
        "root_cause_insight": root_cause,
        "confidence": confidence,
        "status": "open"
    }

    try:
        anomaly_res = await postgrest_post("anomaly_alerts", anomaly_payload)
        anomaly = anomaly_res[0] if isinstance(anomaly_res, list) else anomaly_res
        logger.info(f"Anomaly created for {ph_id} on {rec_date}: {severity}, error={error_mw:.2f} MW")

        # Create notifications for admin users
        try:
            await create_notification_for_users(
                roles=[UserRole.ADMIN, UserRole.MANAGER],
                type_="anomaly",
                title=f"Anomaly Alert: {powerhouse.name}",
                message=f"Generation anomaly detected on {rec_date}. Actual: {actual_mw:.2f} MW, Predicted: {predicted_mw:.2f} MW, Error: {error_mw:+.2f} MW ({error_pct:.1f}%).",
                anomaly_id=UUID(anomaly["id"])
            )
        except Exception as ne:
            logger.warning(f"Notification failed for anomaly: {ne}")

        # Critical email alert for severe anomalies
        if error_pct > 40 or is_band_breach:
            try:
                from app.services.email_service import send_critical_anomaly_email
                await send_critical_anomaly_email(
                    powerhouse_name=powerhouse.name,
                    date=rec_date,
                    actual_mw=actual_mw,
                    predicted_mw=predicted_mw,
                    error_mw=error_mw,
                    severity=severity
                )
            except Exception as ee:
                logger.warning(f"Critical anomaly email failed: {ee}")
    except Exception as e:
        logger.error(f"Failed to create anomaly alert: {e}")


async def list_anomalies(
    powerhouse_id: Optional[UUID] = None,
    anomaly_status: Optional[str] = None,
    severity: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
) -> Tuple[List[AnomalyResponse], int]:
    params: Dict[str, Any] = {
        "select": "*,powerhouses(name)",
        "order": "created_at.desc",
        "limit": str(page_size),
        "offset": str((page - 1) * page_size)
    }
    count_p: Dict[str, Any] = {"select": "id"}
    if powerhouse_id:
        params["powerhouse_id"] = f"eq.{str(powerhouse_id)}"
        count_p["powerhouse_id"] = f"eq.{str(powerhouse_id)}"
    if anomaly_status:
        params["status"] = f"eq.{anomaly_status}"
    if severity:
        params["severity"] = f"eq.{severity}"
    if date_from:
        params["anomaly_date"] = f"gte.{date_from}"
    if date_to:
        params["anomaly_date"] = f"lte.{date_to}"

    data = await postgrest_get("anomaly_alerts", params)
    total = len(await postgrest_get("anomaly_alerts", count_p))

    results = []
    for item in data:
        ph_info = item.pop("powerhouses", None)
        item["powerhouse_name"] = ph_info.get("name") if isinstance(ph_info, dict) else None
        results.append(AnomalyResponse(**item))
    return results, total


async def get_anomaly_by_id(anomaly_id: UUID) -> AnomalyResponse:
    data = await postgrest_get("anomaly_alerts", {"id": f"eq.{str(anomaly_id)}", "select": "*,powerhouses(name)"})
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anomaly not found")
    item = data[0]
    ph_info = item.pop("powerhouses", None)
    item["powerhouse_name"] = ph_info.get("name") if isinstance(ph_info, dict) else None
    return AnomalyResponse(**item)


async def update_anomaly_status(
    anomaly_id: UUID,
    new_status: str,
    user_id: UUID,
    client_ip: Optional[str] = None
) -> AnomalyResponse:
    payload: Dict[str, Any] = {"status": new_status}
    if new_status == "acknowledged":
        payload["acknowledged_by"] = str(user_id)
        payload["acknowledged_at"] = "now()"

    updated = await postgrest_patch("anomaly_alerts", payload, {"id": f"eq.{str(anomaly_id)}"})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anomaly not found")

    await log_activity(user_id, f"anomaly_{new_status}", "anomaly_alert", anomaly_id,
                       {"new_status": new_status}, client_ip)

    item = updated[0]
    item["powerhouse_name"] = None
    return AnomalyResponse(**item)
