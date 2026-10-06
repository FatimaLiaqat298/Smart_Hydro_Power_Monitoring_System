from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request, status
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.user import (
    AdminUserCreateResult,
    EmailVerificationConfirmRequest,
    EmailVerificationRequest,
    UserCreate,
    UserResponse,
    UserRole,
    AccountStatus,
    UserUpdate,
    UserStatusUpdate,
)
from app.core.dependencies import require_admin
from app.services import user_service

router = APIRouter(prefix="/users", tags=["User Management"])

@router.get("", response_model=PaginatedResponse[UserResponse], status_code=status.HTTP_200_OK)
async def get_users(
    role: Optional[UserRole] = Query(None, description="Filter by user role"),
    status_filter: Optional[AccountStatus] = Query(None, alias="status", description="Filter by account status"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Page size"),
    admin: UserResponse = Depends(require_admin)
):
    """Admin-only: list all system users with role and status filters."""
    users, total = await user_service.list_users(role, status_filter, page, page_size)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    return PaginatedResponse(
        success=True,
        message="Users retrieved successfully",
        data=users,
        pagination=PaginationMeta(
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages
        )
    )

@router.post("", response_model=ApiResponse[AdminUserCreateResult], status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: UserCreate,
    request: Request,
    admin: UserResponse = Depends(require_admin)
):
    """Admin-only: securely create/invite a user via Supabase Auth and assign application role."""
    client_ip = request.client.host if request.client else None
    new_user = await user_service.create_user_by_admin(user_in, admin, client_ip)
    return ApiResponse(
        success=True,
        message=f"User {new_user.user.email} created successfully",
        data=new_user
    )

@router.post("/email-verification", response_model=ApiResponse[dict], status_code=status.HTTP_200_OK)
async def send_email_verification(
    request_data: EmailVerificationRequest,
    admin: UserResponse = Depends(require_admin)
):
    """Admin-only: send a one-time code before a user account may be created."""
    challenge = await user_service.send_user_email_verification(request_data.email)
    return ApiResponse(success=True, message="Verification code sent", data=challenge)

@router.post("/email-verification/confirm", response_model=ApiResponse[dict], status_code=status.HTTP_200_OK)
async def confirm_email_verification(
    request_data: EmailVerificationConfirmRequest,
    admin: UserResponse = Depends(require_admin)
):
    """Admin-only: verify the code and return a short-lived email proof token."""
    verification = user_service.confirm_user_email_verification(
        request_data.email,
        request_data.code,
        request_data.challenge_token
    )
    return ApiResponse(success=True, message="Email verified", data=verification)

@router.get("/{user_id}", response_model=ApiResponse[UserResponse], status_code=status.HTTP_200_OK)
async def get_user(user_id: UUID, admin: UserResponse = Depends(require_admin)):
    """Admin-only: get specific user profile."""
    user = await user_service.get_user_by_id(user_id)
    return ApiResponse(
        success=True,
        message="User details retrieved",
        data=user
    )

@router.patch("/{user_id}", response_model=ApiResponse[UserResponse], status_code=status.HTTP_200_OK)
async def update_user(
    user_id: UUID,
    user_update: UserUpdate,
    request: Request,
    admin: UserResponse = Depends(require_admin)
):
    """Admin-only: update user information (name, role)."""
    client_ip = request.client.host if request.client else None
    updated = await user_service.update_user(user_id, user_update, admin, client_ip)
    return ApiResponse(
        success=True,
        message="User updated successfully",
        data=updated
    )

@router.patch("/{user_id}/status", response_model=ApiResponse[UserResponse], status_code=status.HTTP_200_OK)
async def update_user_status(
    user_id: UUID,
    status_update: UserStatusUpdate,
    request: Request,
    admin: UserResponse = Depends(require_admin)
):
    """Admin-only: suspend, activate, or deactivate a user account."""
    client_ip = request.client.host if request.client else None
    updated = await user_service.update_user_status(user_id, status_update, admin, client_ip)
    return ApiResponse(
        success=True,
        message=f"User status changed to {status_update.status.value}",
        data=updated
    )

@router.delete("/{user_id}", response_model=ApiResponse[bool], status_code=status.HTTP_200_OK)
async def delete_user(
    user_id: UUID,
    request: Request,
    admin: UserResponse = Depends(require_admin)
):
    """Admin-only: permanently delete a user and their application profile."""
    client_ip = request.client.host if request.client else None
    await user_service.delete_user(user_id, admin, client_ip)
    return ApiResponse(
        success=True,
        message="User deleted successfully",
        data=True
    )
