from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.user import UserResponse
from app.core.dependencies import require_manager_or_admin
from app.db.supabase import postgrest_get

router = APIRouter(prefix="/activity-logs", tags=["Activity Logs"])

@router.get("", response_model=PaginatedResponse[dict])
async def list_activity_logs(
    user_id: Optional[UUID] = Query(None, description="Filter by user"),
    action: Optional[str] = Query(None, description="Filter by action keyword"),
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    user: UserResponse = Depends(require_manager_or_admin)
):
    """
    Manager & Admin: View system activity audit logs.
    Includes user information and parsed event details.
    """
    params = {
        "select": "*,users(name,email,role)",
        "order": "created_at.desc",
        "limit": str(page_size),
        "offset": str((page - 1) * page_size)
    }
    count_p = {"select": "id"}
    
    if user_id:
        params["user_id"] = f"eq.{str(user_id)}"
        count_p["user_id"] = f"eq.{str(user_id)}"
    if action:
        params["action"] = f"ilike.*{action}*"
        count_p["action"] = f"ilike.*{action}*"
    if entity_type:
        params["entity_type"] = f"eq.{entity_type}"
        count_p["entity_type"] = f"eq.{entity_type}"

    data = await postgrest_get("activity_logs", params)
    total_recs = await postgrest_get("activity_logs", count_p)
    total = len(total_recs)

    rows = []
    for item in data:
        user_info = item.pop("users", None)
        item["user_name"] = user_info.get("name") if isinstance(user_info, dict) else (item.get("user_name") or "System / User")
        item["user_email"] = user_info.get("email") if isinstance(user_info, dict) else (item.get("user_email") or "")
        item["user_role"] = user_info.get("role") if isinstance(user_info, dict) else (item.get("user_role") or "user")
        rows.append(item)

    return PaginatedResponse(
        success=True,
        message="Activity logs retrieved",
        data=rows,
        pagination=PaginationMeta(
            page=page,
            page_size=page_size,
            total=total,
            total_pages=(total + page_size - 1) // page_size if total else 1
        )
    )
