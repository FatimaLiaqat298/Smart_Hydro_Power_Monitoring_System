import logging
from typing import List, Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.security import verify_supabase_token
from app.db.supabase import postgrest_get
from app.schemas.user import UserResponse, UserRole, AccountStatus

logger = logging.getLogger(__name__)
security_scheme = HTTPBearer(auto_error=False)

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_scheme)
) -> UserResponse:
    """
    Dependency that extracts and validates Supabase JWT, looks up the corresponding
    profile in the users table, and verifies that the account is active.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please provide a Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    auth_data = verify_supabase_token(token)
    user_id = auth_data["id"]

    # Query the users table for application profile and role
    try:
        profiles = await postgrest_get("users", {"id": f"eq.{user_id}"})
        if not profiles:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found in system database."
            )
        profile = profiles[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch user profile for {user_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving user profile from database."
        )

    # Check account status
    if profile.get("status") == AccountStatus.SUSPENDED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been suspended. Please contact the administrator."
        )
    if profile.get("status") == AccountStatus.DEACTIVATED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated."
        )

    return UserResponse(**profile)

def require_roles(allowed_roles: List[UserRole]):
    """
    Dependency factory that checks if the authenticated user has one of the allowed roles.
    """
    async def role_checker(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires one of roles: {[r.value for r in allowed_roles]}"
            )
        return current_user
    return role_checker

# Standard role dependencies
require_admin = require_roles([UserRole.ADMIN])
require_manager_or_admin = require_roles([UserRole.ADMIN, UserRole.MANAGER])
require_operational = require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER])
