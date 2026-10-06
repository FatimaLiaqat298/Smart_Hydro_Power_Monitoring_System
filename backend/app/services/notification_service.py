import logging
from typing import List, Optional
from uuid import UUID
from app.db.supabase import postgrest_get, postgrest_post
from app.schemas.user import UserRole

logger = logging.getLogger(__name__)

async def create_notification_for_users(
    roles: List[UserRole],
    type_: str,
    title: str,
    message: str,
    anomaly_id: Optional[UUID] = None,
    report_id: Optional[UUID] = None
) -> None:
    """Creates in-app notifications for all users with the specified roles."""
    try:
        # Get all users with specified roles
        all_users = []
        for role in roles:
            users = await postgrest_get("users", {"role": f"eq.{role.value}", "status": "eq.active", "select": "id"})
            all_users.extend(users)

        if not all_users:
            logger.info(f"No active users with roles {[r.value for r in roles]} to notify")
            return

        notifications = []
        seen_ids = set()
        for u in all_users:
            uid = u["id"]
            if uid in seen_ids:
                continue
            seen_ids.add(uid)
            notif = {
                "user_id": uid,
                "type": type_,
                "title": title,
                "message": message,
                "is_read": False
            }
            if anomaly_id:
                notif["anomaly_id"] = str(anomaly_id)
            if report_id:
                notif["report_id"] = str(report_id)
            notifications.append(notif)

        if notifications:
            await postgrest_post("notifications", notifications)
            logger.info(f"Created {len(notifications)} notifications: {title}")
    except Exception as e:
        logger.error(f"Failed to create notifications: {e}")


async def get_user_notifications(
    user_id: UUID,
    unread_only: bool = False,
    page: int = 1,
    page_size: int = 20
):
    params = {
        "user_id": f"eq.{str(user_id)}",
        "select": "*",
        "order": "created_at.desc",
        "limit": str(page_size),
        "offset": str((page - 1) * page_size)
    }
    if unread_only:
        params["is_read"] = "eq.false"
    return await postgrest_get("notifications", params)


async def get_unread_count(user_id: UUID) -> int:
    data = await postgrest_get("notifications", {
        "user_id": f"eq.{str(user_id)}",
        "is_read": "eq.false",
        "select": "id"
    })
    return len(data)


async def mark_read(notification_id: UUID, user_id: UUID) -> bool:
    from app.db.supabase import postgrest_patch
    updated = await postgrest_patch(
        "notifications",
        {"is_read": True},
        {"id": f"eq.{str(notification_id)}", "user_id": f"eq.{str(user_id)}"}
    )
    return bool(updated)


async def mark_all_read(user_id: UUID) -> int:
    from app.db.supabase import postgrest_patch
    updated = await postgrest_patch(
        "notifications",
        {"is_read": True},
        {"user_id": f"eq.{str(user_id)}", "is_read": "eq.false"}
    )
    return len(updated) if updated else 0
