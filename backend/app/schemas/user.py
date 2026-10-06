from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field

class UserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    ENGINEER = "engineer"
    VIEWER = "viewer"

class AccountStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DEACTIVATED = "deactivated"

class UserBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr = Field(..., description="User's email address")
    role: UserRole = UserRole.VIEWER

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, pattern=r".*\d.*", description="Temporary password sent to the user's email.")

class EmailVerificationRequest(BaseModel):
    email: EmailStr

class EmailVerificationConfirmRequest(EmailVerificationRequest):
    code: str = Field(..., pattern=r"^\d{8}$")
    challenge_token: str

class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    role: Optional[UserRole] = None

class UserStatusUpdate(BaseModel):
    status: AccountStatus

class UserResponse(BaseModel):
    id: UUID
    name: str
    email: str
    role: UserRole
    status: AccountStatus
    created_by: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AdminUserCreateResult(BaseModel):
    user: UserResponse
    email_sent: bool

class LoginRequest(BaseModel):
    email: str = Field(..., description="Email address")
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    token: Optional[str] = None  # alias for frontend compatibility
    refresh_token: Optional[str] = None
