import logging
from typing import Any, Dict, Optional
from uuid import UUID
from app.db.supabase import postgrest_post

logger = logging.getLogger(__name__)

async def log_activity(
    user_id: Optional[UUID],
    action: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[UUID] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None
) -> None:
    """Records an audit event in the activity_logs table asynchronously."""
    try:
        payload = {
            "user_id": str(user_id) if user_id else None,
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id else None,
            "details": details or {},
            "ip_address": ip_address
        }
        await postgrest_post("activity_logs", payload)
    except Exception as e:
        # Non-blocking: audit failure should not crash main transaction, but must be logged
        logger.error(f"Failed to record activity log [{action}]: {e}")
