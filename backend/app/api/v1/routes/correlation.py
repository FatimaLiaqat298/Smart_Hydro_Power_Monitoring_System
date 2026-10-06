from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from app.schemas.common import ApiResponse
from app.schemas.user import UserResponse
from app.core.dependencies import get_current_user
from app.services.analytics_service import get_inflow_generation_correlation

router = APIRouter(prefix="/correlation", tags=["Hydrology-Generation Correlation"])

@router.get("/inflow-generation", response_model=ApiResponse[dict], status_code=status.HTTP_200_OK)
async def inflow_generation_correlation(
    powerhouse_id: UUID = Query(..., description="Target powerhouse UUID (required)"),
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    user: UserResponse = Depends(get_current_user)
):
    """
    Computes Pearson correlation coefficient between actual inflow (cumecs) and generation (MW)
    for the selected powerhouse and date range. Returns structured data suitable for scatter charts.
    """
    data = await get_inflow_generation_correlation(powerhouse_id, date_from, date_to)
    return ApiResponse(
        success=True,
        message="Correlation analysis complete",
        data=data
    )
