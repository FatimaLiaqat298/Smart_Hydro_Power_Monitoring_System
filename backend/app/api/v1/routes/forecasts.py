from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.forecast import (
    ForecastResultResponse, ForecastRunRequest, ForecastRunResponse, PlantForecastResponse
)
from app.schemas.user import UserResponse
from app.core.dependencies import get_current_user, require_manager_or_admin
from app.services import forecast_service

router = APIRouter(prefix="/forecasts", tags=["Forecasting"])


@router.get("", response_model=PaginatedResponse[ForecastResultResponse])
async def list_forecasts(
    powerhouse_id: Optional[UUID] = Query(None, description="Filter by powerhouse"),
    origin_date: Optional[str] = Query(None, description="Filter by model run date (YYYY-MM-DD)"),
    target_date: Optional[str] = Query(None, description="Filter by forecast target date (YYYY-MM-DD)"),
    horizon_days: Optional[int] = Query(None, ge=1, le=7, description="Filter by horizon (1-7)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: UserResponse = Depends(get_current_user)
):
    """Retrieve stored forecast results. Supports filtering by powerhouse, origin date, target date, horizon."""
    results, total = await forecast_service.list_forecasts(
        powerhouse_id, origin_date, target_date, horizon_days, page, page_size)
    total_pages = (total + page_size - 1) // page_size if total else 1
    return PaginatedResponse(success=True, message="Forecast results retrieved", data=results,
        pagination=PaginationMeta(page=page, page_size=page_size, total=total, total_pages=total_pages))


@router.post("/run", response_model=ApiResponse[ForecastRunResponse], status_code=status.HTTP_200_OK)
async def run_forecast(
    run_req: ForecastRunRequest,
    user: UserResponse = Depends(require_manager_or_admin)
):
    """
    Triggers a 7-day forecast run using the embedded SHPMFS Hybrid ML model.
    Saves results to forecast_results table. Requires Manager or Admin role.
    """
    result = await forecast_service.run_forecast(run_req)
    return ApiResponse(success=True, message=result.message, data=result)


@router.get("/live/{powerhouse_id}", response_model=ApiResponse[PlantForecastResponse])
async def get_live_forecast(
    powerhouse_id: UUID,
    user: UserResponse = Depends(get_current_user)
):
    """
    Returns a real-time 7-day ML forecast for a specific powerhouse.
    Also returns last 14 days of historical actual generation for chart context.
    Does NOT save to DB — purely on-demand inference.
    """
    # Get plant name from DB
    from app.db.supabase import postgrest_get
    ph_rows = await postgrest_get("powerhouses", {"id": f"eq.{str(powerhouse_id)}", "select": "id,name"})
    if not ph_rows:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Powerhouse not found")

    plant_name = ph_rows[0]["name"]
    result = await forecast_service.get_live_forecast_for_plant(plant_name, str(powerhouse_id))
    return ApiResponse(success=True, message="Live forecast generated", data=PlantForecastResponse(**result))


@router.get("/{forecast_id}", response_model=ApiResponse[ForecastResultResponse])
async def get_forecast(forecast_id: UUID, user: UserResponse = Depends(get_current_user)):
    """Get single forecast result by ID."""
    result = await forecast_service.get_forecast_by_id(forecast_id)
    return ApiResponse(success=True, message="Forecast retrieved", data=result)
