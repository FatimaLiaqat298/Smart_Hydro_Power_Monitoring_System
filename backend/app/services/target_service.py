import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
from fastapi import HTTPException, status
from app.db.supabase import postgrest_get, postgrest_post, postgrest_patch
from app.schemas.target import TargetCreate, TargetResponse, TargetUpdate, PerformanceSummaryResponse
from app.schemas.user import UserResponse
from app.services.activity_log_service import log_activity

logger = logging.getLogger(__name__)

async def create_target(t_in: TargetCreate, user: UserResponse, client_ip: Optional[str] = None) -> TargetResponse:
    if t_in.period_end < t_in.period_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="period_end must be >= period_start")
    payload = {
        "powerhouse_id": str(t_in.powerhouse_id),
        "period_type": t_in.period_type.value,
        "period_start": t_in.period_start.isoformat(),
        "period_end": t_in.period_end.isoformat(),
        "target_mw": float(t_in.target_mw),
        "set_by": str(user.id)
    }
    res = await postgrest_post("targets", payload)
    created = res[0] if isinstance(res, list) else res
    await log_activity(user.id, "create_target", "target", UUID(created["id"]),
                       {"powerhouse_id": str(t_in.powerhouse_id), "target_mw": float(t_in.target_mw)}, client_ip)
    return TargetResponse(**created)

async def list_targets(powerhouse_id: Optional[UUID] = None, page: int = 1, page_size: int = 20) -> Tuple[List[TargetResponse], int]:
    params: Dict[str, Any] = {"select": "*", "order": "created_at.desc", "limit": str(page_size), "offset": str((page - 1) * page_size)}
    if powerhouse_id:
        params["powerhouse_id"] = f"eq.{str(powerhouse_id)}"
    data = await postgrest_get("targets", params)
    count_p: Dict[str, Any] = {"select": "id"}
    if powerhouse_id:
        count_p["powerhouse_id"] = f"eq.{str(powerhouse_id)}"
    total = len(await postgrest_get("targets", count_p))
    return [TargetResponse(**t) for t in data], total

async def get_target_by_id(target_id: UUID) -> TargetResponse:
    data = await postgrest_get("targets", {"id": f"eq.{str(target_id)}"})
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")
    return TargetResponse(**data[0])

async def update_target(target_id: UUID, t_upd: TargetUpdate, user: UserResponse, client_ip: Optional[str] = None) -> TargetResponse:
    payload: Dict[str, Any] = {}
    if t_upd.period_type: payload["period_type"] = t_upd.period_type.value
    if t_upd.period_start: payload["period_start"] = t_upd.period_start.isoformat()
    if t_upd.period_end: payload["period_end"] = t_upd.period_end.isoformat()
    if t_upd.target_mw: payload["target_mw"] = float(t_upd.target_mw)
    updated = await postgrest_patch("targets", payload, {"id": f"eq.{str(target_id)}"})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")
    await log_activity(user.id, "update_target", "target", target_id, payload, client_ip)
    return TargetResponse(**updated[0])

async def get_performance_summary(powerhouse_id: Optional[UUID] = None) -> List[PerformanceSummaryResponse]:
    """
    Computes real-time performance outcome for all saved targets by comparing
    total actual generation across the target period against the target MW.
    Executes in parallel using asyncio.gather.
    """
    params: Dict[str, Any] = {"select": "*", "order": "created_at.desc", "limit": "25"}
    if powerhouse_id:
        params["powerhouse_id"] = f"eq.{str(powerhouse_id)}"
    
    targets = await postgrest_get("targets", params)
    if not targets:
        return []

    # Get powerhouse names
    phs = await postgrest_get("powerhouses", {"select": "id,name"})
    ph_map = {p["id"]: p["name"] for p in phs}

    async def calculate_target_performance(t: dict) -> PerformanceSummaryResponse:
        ph_id = t["powerhouse_id"]
        p_start = t["period_start"]
        p_end = t["period_end"]
        target_mw = float(t.get("target_mw") or 0.0)

        try:
            recs = await postgrest_get("generation_records", {
                "powerhouse_id": f"eq.{ph_id}",
                "reading_date": f"gte.{p_start}",
                "and": f"(reading_date.lte.{p_end})",
                "select": "avg_station_load_mw",
                "limit": "100"
            })
        except Exception as e:
            logger.warning(f"Error fetching records for target {t.get('id')}: {e}")
            recs = []

        if not recs:
            return PerformanceSummaryResponse(
                target_id=UUID(t["id"]),
                powerhouse_id=UUID(ph_id),
                powerhouse_name=ph_map.get(ph_id, "Unknown"),
                period_type=t.get("period_type", "custom"),
                period_start=p_start,
                period_end=p_end,
                target_mw=round(target_mw, 2),
                actual_avg_mw=None,
                variance_mw=None,
                status="no_data"
            )

        total_gen_mw = sum(float(r.get("avg_station_load_mw") or 0.0) for r in recs)
        variance = total_gen_mw - target_mw
        is_achieved = variance >= 0

        return PerformanceSummaryResponse(
            target_id=UUID(t["id"]),
            powerhouse_id=UUID(ph_id),
            powerhouse_name=ph_map.get(ph_id, "Unknown"),
            period_type=t.get("period_type", "custom"),
            period_start=p_start,
            period_end=p_end,
            target_mw=round(target_mw, 2),
            actual_avg_mw=round(total_gen_mw, 2),
            variance_mw=round(variance, 2),
            status="achieved" if is_achieved else "missed"
        )

    results = await asyncio.gather(*[calculate_target_performance(t) for t in targets])
    return list(results)
