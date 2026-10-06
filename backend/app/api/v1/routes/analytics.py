from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from app.schemas.common import ApiResponse
from app.schemas.user import UserResponse
from app.core.dependencies import get_current_user
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["Analytics Dashboard"])

@router.get("/overview", response_model=ApiResponse[dict], status_code=status.HTTP_200_OK)
async def dashboard_overview(
    powerhouse_id: Optional[UUID] = Query(None, description="Filter by specific powerhouse (omit for fleet-wide)"),
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    user: UserResponse = Depends(get_current_user)
):
    """Dashboard KPI Cards: Total kWh, GWh, Avg MW, Revenue, Outages."""
    data = await analytics_service.get_dashboard_kpis(powerhouse_id, date_from, date_to)
    return ApiResponse(success=True, message="Dashboard KPIs retrieved", data=data)

@router.get("/generation-trend", response_model=ApiResponse[list], status_code=status.HTTP_200_OK)
async def generation_trend(
    powerhouse_id: Optional[UUID] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    user: UserResponse = Depends(get_current_user)
):
    """Daily generation trend data for line charts."""
    data = await analytics_service.get_generation_trend(powerhouse_id, date_from, date_to)
    return ApiResponse(success=True, message="Generation trend data retrieved", data=data)

@router.get("/monthly-trend", response_model=ApiResponse[list], status_code=status.HTTP_200_OK)
async def monthly_trend(
    powerhouse_id: Optional[UUID] = Query(None),
    user: UserResponse = Depends(get_current_user)
):
    """Monthly aggregated generation trend."""
    data = await analytics_service.get_monthly_trend(powerhouse_id)
    return ApiResponse(success=True, message="Monthly trend data retrieved", data=data)

@router.get("/powerhouse-performance", response_model=ApiResponse[list], status_code=status.HTTP_200_OK)
async def powerhouse_performance(user: UserResponse = Depends(get_current_user)):
    """Per-powerhouse performance summary: avg load, plant factor, outage days."""
    data = await analytics_service.get_powerhouse_performance()
    return ApiResponse(success=True, message="Powerhouse performance data retrieved", data=data)

@router.get("/inflow-vs-generation", response_model=ApiResponse[list], status_code=status.HTTP_200_OK)
async def inflow_vs_generation(
    powerhouse_id: Optional[UUID] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    user: UserResponse = Depends(get_current_user)
):
    """Paired inflow (cumecs) vs generation (MW) data for dual-axis/scatter chart."""
    data = await analytics_service.get_inflow_vs_generation(powerhouse_id, date_from, date_to)
    return ApiResponse(success=True, message="Inflow vs generation data retrieved", data=data)

@router.get("/efficiency", response_model=ApiResponse[list], status_code=status.HTTP_200_OK)
async def efficiency_by_plant(user: UserResponse = Depends(get_current_user)):
    """Efficiency (avg plant factor %) per powerhouse for efficiency bar chart."""
    data = await analytics_service.get_efficiency_by_plant()
    return ApiResponse(success=True, message="Efficiency data retrieved", data=data)

@router.get("/status", response_model=ApiResponse[dict], status_code=status.HTTP_200_OK)
async def dashboard_status(
    powerhouse_id: Optional[UUID] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    user: UserResponse = Depends(get_current_user)
):
    """Operational status summary widget: running/partial/shutdown plant counts."""
    data = await analytics_service.get_dashboard_status(powerhouse_id, date_from, date_to)
    return ApiResponse(success=True, message="Status summary retrieved", data=data)


# ----- Dashboard compatibility aliases (matches frontend /api/dashboard/... calls) -----
dashboard_router = APIRouter(prefix="/dashboard", tags=["Dashboard Compatibility"])

@dashboard_router.get("/kpis")
async def _kpis(
    powerhouse_id: Optional[str] = Query(None),
    plant: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    user: UserResponse = Depends(get_current_user)
):
    pid = await analytics_service.resolve_powerhouse_id(plant or powerhouse_id)
    data = await analytics_service.get_dashboard_kpis(pid, startDate, endDate)
    return data

@dashboard_router.get("/linechart")
async def _linechart(
    powerhouse_id: Optional[str] = Query(None),
    plant: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    user: UserResponse = Depends(get_current_user)
):
    pid = await analytics_service.resolve_powerhouse_id(plant or powerhouse_id)
    data = await analytics_service.get_generation_trend(pid, startDate, endDate)
    return data

@dashboard_router.get("/inflow")
async def _inflow(
    powerhouse_id: Optional[str] = Query(None),
    plant: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    user: UserResponse = Depends(get_current_user)
):
    pid = await analytics_service.resolve_powerhouse_id(plant or powerhouse_id)
    data = await analytics_service.get_inflow_vs_generation(pid, startDate, endDate)
    return data

@dashboard_router.get("/status")
async def _status(
    powerhouse_id: Optional[str] = Query(None),
    plant: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    user: UserResponse = Depends(get_current_user)
):
    pid = await analytics_service.resolve_powerhouse_id(plant or powerhouse_id)
    data = await analytics_service.get_dashboard_status(pid, startDate, endDate)
    return data

@dashboard_router.get("/monthly")
async def _monthly(
    powerhouse_id: Optional[str] = Query(None),
    plant: Optional[str] = Query(None),
    startDate: Optional[str] = Query(None),
    endDate: Optional[str] = Query(None),
    user: UserResponse = Depends(get_current_user)
):
    pid = await analytics_service.resolve_powerhouse_id(plant or powerhouse_id)
    data = await analytics_service.get_monthly_trend(pid, startDate, endDate)
    return data

@dashboard_router.get("/efficiency")
async def _efficiency(user: UserResponse = Depends(get_current_user)):
    data = await analytics_service.get_efficiency_by_plant()
    return data
