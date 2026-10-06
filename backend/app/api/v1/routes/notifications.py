from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.user import UserResponse
from app.core.dependencies import get_current_user
from app.services import notification_service

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("", response_model=PaginatedResponse[dict])
async def list_notifications(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    user: UserResponse = Depends(get_current_user)
):
    data = await notification_service.get_user_notifications(user.id, page=page, page_size=page_size)
    count_data = await notification_service.get_user_notifications(user.id, page=1, page_size=10000)
    total = len(count_data)
    return PaginatedResponse(success=True, message="Notifications retrieved", data=data,
        pagination=PaginationMeta(page=page, page_size=page_size, total=total,
                                  total_pages=(total + page_size - 1) // page_size if total else 1))

@router.get("/unread-count", response_model=ApiResponse[dict])
async def unread_count(user: UserResponse = Depends(get_current_user)):
    count = await notification_service.get_unread_count(user.id)
    return ApiResponse(success=True, message="Unread count retrieved", data={"unread_count": count})

@router.patch("/{notification_id}/read", response_model=ApiResponse[bool])
async def mark_notification_read(notification_id: UUID, user: UserResponse = Depends(get_current_user)):
    result = await notification_service.mark_read(notification_id, user.id)
    return ApiResponse(success=True, message="Notification marked as read", data=result)

@router.patch("/read-all", response_model=ApiResponse[dict])
async def mark_all_notifications_read(user: UserResponse = Depends(get_current_user)):
    count = await notification_service.mark_all_read(user.id)
    return ApiResponse(success=True, message=f"Marked {count} notifications as read", data={"count": count})
