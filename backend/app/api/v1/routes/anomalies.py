from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request, status
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.anomaly import AnomalyResponse, AnomalyAcknowledgeRequest
from app.schemas.user import UserResponse
from app.core.dependencies import get_current_user, require_operational
from app.services import anomaly_service

router = APIRouter(prefix="/anomalies", tags=["Anomaly Alerts"])

@router.get("", response_model=PaginatedResponse[AnomalyResponse])
async def list_anomalies(
    powerhouse_id: Optional[UUID] = Query(None),
    anomaly_status: Optional[str] = Query(None, alias="status", description="open|acknowledged|dismissed|escalated"),
    severity: Optional[str] = Query(None, description="sigma_alert|band_breach"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    user: UserResponse = Depends(get_current_user)
):
    """List anomaly alerts with powerhouse, status, severity, and date filters."""
    results, total = await anomaly_service.list_anomalies(
        powerhouse_id, anomaly_status, severity, date_from, date_to, page, page_size)
    return PaginatedResponse(success=True, message="Anomalies retrieved", data=results,
        pagination=PaginationMeta(page=page, page_size=page_size, total=total,
                                  total_pages=(total + page_size - 1) // page_size if total else 1))

@router.get("/{anomaly_id}", response_model=ApiResponse[AnomalyResponse])
async def get_anomaly(anomaly_id: UUID, user: UserResponse = Depends(get_current_user)):
    a = await anomaly_service.get_anomaly_by_id(anomaly_id)
    return ApiResponse(success=True, message="Anomaly details retrieved", data=a)

@router.patch("/{anomaly_id}/acknowledge", response_model=ApiResponse[AnomalyResponse])
async def acknowledge_anomaly(anomaly_id: UUID, req: AnomalyAcknowledgeRequest,
                              request: Request, user: UserResponse = Depends(require_operational)):
    updated = await anomaly_service.update_anomaly_status(
        anomaly_id, "acknowledged", user.id, request.client.host if request.client else None)
    return ApiResponse(success=True, message="Anomaly acknowledged", data=updated)

@router.patch("/{anomaly_id}/dismiss", response_model=ApiResponse[AnomalyResponse])
async def dismiss_anomaly(anomaly_id: UUID, request: Request,
                          user: UserResponse = Depends(require_operational)):
    updated = await anomaly_service.update_anomaly_status(
        anomaly_id, "dismissed", user.id, request.client.host if request.client else None)
    return ApiResponse(success=True, message="Anomaly dismissed", data=updated)

@router.patch("/{anomaly_id}/escalate", response_model=ApiResponse[AnomalyResponse])
async def escalate_anomaly(anomaly_id: UUID, request: Request,
                           user: UserResponse = Depends(require_operational)):
    updated = await anomaly_service.update_anomaly_status(
        anomaly_id, "escalated", user.id, request.client.host if request.client else None)
    return ApiResponse(success=True, message="Anomaly escalated", data=updated)
