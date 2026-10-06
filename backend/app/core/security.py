import logging
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
import jwt
from app.core.config import settings
from app.db.supabase import get_supabase_admin

logger = logging.getLogger(__name__)

def verify_token_locally(token: str) -> Optional[Dict[str, Any]]:
    """Decode JWT token claims without secret verification for quick inspection."""
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        return payload
    except Exception as e:
        logger.warning(f"Failed to decode token locally: {e}")
        return None

def verify_supabase_token(token: str) -> Dict[str, Any]:
    """
    Validates the Bearer token with Supabase GoTrue Auth service.
    Returns the user data dictionary if valid, raises HTTPException otherwise.
    """
    try:
        supabase = get_supabase_admin()
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authentication token"
            )
        return {
            "id": user_response.user.id,
            "email": user_response.user.email,
            "app_metadata": user_response.user.app_metadata or {},
            "user_metadata": user_response.user.user_metadata or {}
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying token with Supabase: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )
