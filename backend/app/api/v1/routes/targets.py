from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request, status
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.target import TargetCreate, TargetResponse, TargetUpdate, PerformanceSummaryResponse
from app.schemas.user import UserResponse
from app.core.dependencies import get_current_user, require_manager_or_admin
from app.services import target_service

router = APIRouter(prefix="/targets", tags=["Targets & Performance"])

@router.get("", response_model=PaginatedResponse[TargetResponse])
async def list_targets(
    powerhouse_id: Optional[UUID] = Query(None),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    user: UserResponse = Depends(get_current_user)
):
    targets, total = await target_service.list_targets(powerhouse_id, page, page_size)
    return PaginatedResponse(success=True, message="Targets retrieved", data=targets,
        pagination=PaginationMeta(page=page, page_size=page_size, total=total,
                                  total_pages=(total + page_size - 1) // page_size if total else 1))

@router.post("", response_model=ApiResponse[TargetResponse], status_code=status.HTTP_201_CREATED)
async def create_target(t_in: TargetCreate, request: Request,
                        user: UserResponse = Depends(require_manager_or_admin)):
    created = await target_service.create_target(t_in, user, request.client.host if request.client else None)
    return ApiResponse(success=True, message="Target created", data=created)

@router.get("/performance", response_model=ApiResponse[list])
async def get_performance(
    powerhouse_id: Optional[UUID] = Query(None),
    user: UserResponse = Depends(get_current_user)
):
    data = await target_service.get_performance_summary(powerhouse_id)
    return ApiResponse(success=True, message="Performance summary retrieved", data=[d.model_dump() for d in data])

@router.get("/{target_id}", response_model=ApiResponse[TargetResponse])
async def get_target(target_id: UUID, user: UserResponse = Depends(get_current_user)):
    t = await target_service.get_target_by_id(target_id)
    return ApiResponse(success=True, message="Target details retrieved", data=t)

@router.patch("/{target_id}", response_model=ApiResponse[TargetResponse])
async def update_target(target_id: UUID, t_upd: TargetUpdate, request: Request,
                        user: UserResponse = Depends(require_manager_or_admin)):
    updated = await target_service.update_target(target_id, t_upd, user, request.client.host if request.client else None)
    return ApiResponse(success=True, message="Target updated", data=updated)
