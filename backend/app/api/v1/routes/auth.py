from fastapi import APIRouter, Depends, Request, status
from app.schemas.common import ApiResponse
from app.schemas.user import LoginRequest, LoginResponse, RefreshRequest, UserResponse
from app.services.user_service import login_user, refresh_user_session
from app.core.dependencies import get_current_user
from app.services.activity_log_service import log_activity

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=ApiResponse[LoginResponse], status_code=status.HTTP_200_OK)
async def login(login_req: LoginRequest, request: Request):
    """
    User login endpoint. Authenticates against Supabase Auth,
    verifies active status, and returns session JWT with user profile.
    """
    client_ip = request.client.host if request.client else None
    result = await login_user(login_req.email, login_req.password, client_ip)
    return ApiResponse(
        success=True,
        message="Login successful",
        data=result
    )

@router.post("/refresh", response_model=ApiResponse[LoginResponse], status_code=status.HTTP_200_OK)
async def refresh_session(refresh_req: RefreshRequest):
    """Refreshes an expired access token using the Supabase refresh token."""
    result = await refresh_user_session(refresh_req.refresh_token)
    return ApiResponse(
        success=True,
        message="Session refreshed",
        data=result
    )

@router.get("/me", response_model=ApiResponse[UserResponse], status_code=status.HTTP_200_OK)
async def get_me(current_user: UserResponse = Depends(get_current_user)):
    """Returns the currently authenticated user's profile and RBAC role."""
    return ApiResponse(
        success=True,
        message="Current user profile retrieved",
        data=current_user
    )

@router.post("/logout", response_model=ApiResponse[bool], status_code=status.HTTP_200_OK)
async def logout(request: Request, current_user: UserResponse = Depends(get_current_user)):
    """Logs the user logout action for audit trail."""
    client_ip = request.client.host if request.client else None
    await log_activity(
        user_id=current_user.id,
        action="logout",
        entity_type="user",
        entity_id=current_user.id,
        ip_address=client_ip
    )
    return ApiResponse(
        success=True,
        message="Logged out successfully",
        data=True
    )
