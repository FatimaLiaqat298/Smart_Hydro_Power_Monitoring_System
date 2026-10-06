import logging
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
from fastapi import HTTPException, status
import jwt
from email_validator import EmailNotValidError, validate_email
from app.db.supabase import get_supabase_admin, postgrest_get, postgrest_post, postgrest_patch, postgrest_delete
from app.schemas.user import AdminUserCreateResult, UserCreate, UserResponse, UserRole, AccountStatus, UserUpdate, UserStatusUpdate, LoginResponse
from app.services.activity_log_service import log_activity

logger = logging.getLogger(__name__)

def _email_token_secret() -> str:
    from app.core.config import settings
    return settings.SUPABASE_SERVICE_ROLE_KEY

async def send_user_email_verification(email: str) -> Dict[str, str]:
    """Sends an expiring code and returns a signed challenge bound to the address."""
    from app.core.config import settings
    from app.services.email_service import send_user_email_verification as send_code

    try:
        normalized_email = validate_email(email, check_deliverability=True).normalized.casefold()
    except EmailNotValidError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid or undeliverable email address: {e}")

    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Email delivery is not configured.")

    existing_profiles = await postgrest_get("users", {"email": f"eq.{normalized_email}"})
    if existing_profiles:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists.")

    code = f"{secrets.randbelow(100_000_000):08d}"
    challenge_token = jwt.encode(
        {
            "email": normalized_email,
            "code_hash": hmac.new(_email_token_secret().encode(), code.encode(), hashlib.sha256).hexdigest(),
            "purpose": "user_email_challenge",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        },
        _email_token_secret(),
        algorithm="HS256"
    )
    if not await send_code(normalized_email, code):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not send the verification email.")
    return {"challenge_token": challenge_token}

def confirm_user_email_verification(email: str, code: str, challenge_token: str) -> Dict[str, str]:
    """Confirms an emailed code and returns a short-lived proof for account creation."""
    try:
        normalized_email = validate_email(email, check_deliverability=True).normalized.casefold()
        challenge = jwt.decode(challenge_token, _email_token_secret(), algorithms=["HS256"])
    except (EmailNotValidError, jwt.PyJWTError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email verification code is invalid or expired.")

    submitted_hash = hmac.new(_email_token_secret().encode(), code.encode(), hashlib.sha256).hexdigest()
    if (
        challenge.get("purpose") != "user_email_challenge"
        or challenge.get("email") != normalized_email
        or not hmac.compare_digest(challenge.get("code_hash", ""), submitted_hash)
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email verification code is incorrect.")

    verification_token = jwt.encode(
        {
            "email": normalized_email,
            "purpose": "verified_user_email",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        _email_token_secret(),
        algorithm="HS256"
    )
    return {"email_verification_token": verification_token}

async def login_user(email: str, password: str, client_ip: Optional[str] = None) -> LoginResponse:
    """Authenticates a user via Supabase Auth and returns token with user profile."""
    from supabase import create_client
    from app.core.config import settings
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    try:
        auth_res = supabase.auth.sign_in_with_password({
            "email": email,
            "password": password
        })
        if not auth_res or not auth_res.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )
        
        user_id = auth_res.user.id
        token = auth_res.session.access_token

        # Fetch profile
        profiles = await postgrest_get("users", {"id": f"eq.{user_id}"})
        if not profiles:
            # First-time sync if user exists in Supabase Auth but profile record wasn't created yet
            role = auth_res.user.user_metadata.get("role", UserRole.VIEWER.value)
            name = auth_res.user.user_metadata.get("name", email.split("@")[0])
            new_profile = {
                "id": user_id,
                "name": name,
                "email": email,
                "role": role,
                "status": AccountStatus.ACTIVE.value
            }
            inserted = await postgrest_post("users", new_profile)
            profile_data = inserted[0] if isinstance(inserted, list) else inserted
        else:
            profile_data = profiles[0]

        user_resp = UserResponse(**profile_data)

        if user_resp.status != AccountStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is {user_resp.status.value}"
            )

        await log_activity(
            user_id=user_resp.id,
            action="login",
            entity_type="user",
            entity_id=user_resp.id,
            ip_address=client_ip
        )

        return LoginResponse(
            access_token=token,
            token=token,
            refresh_token=auth_res.session.refresh_token,
            token_type="bearer",
            user=user_resp
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login failed for {email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )

async def refresh_user_session(refresh_token: str) -> LoginResponse:
    """Refreshes a Supabase session and returns the user's current application profile."""
    from supabase import create_client
    from app.core.config import settings

    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    try:
        auth_res = supabase.auth.refresh_session(refresh_token)
        if not auth_res or not auth_res.session or not auth_res.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Refresh token is invalid or expired. Please sign in again."
            )

        profiles = await postgrest_get("users", {"id": f"eq.{auth_res.user.id}"})
        if not profiles:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found in system database."
            )

        user_resp = UserResponse(**profiles[0])
        if user_resp.status != AccountStatus.ACTIVE:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Account is {user_resp.status.value}"
            )

        return LoginResponse(
            access_token=auth_res.session.access_token,
            token=auth_res.session.access_token,
            refresh_token=auth_res.session.refresh_token,
            user=user_resp
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Session refresh failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session refresh failed. Please sign in again."
        )

async def create_user_by_admin(
    user_in: UserCreate,
    admin_user: UserResponse,
    client_ip: Optional[str] = None
) -> AdminUserCreateResult:
    """Admin creates a new user in Supabase Auth, persists their profile in public.users, and dispatches credentials via email."""
    try:
        validated_email = validate_email(user_in.email, check_deliverability=True).normalized.casefold()
    except EmailNotValidError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid or undeliverable email address: {e}")

    existing_profiles = await postgrest_get("users", {"email": f"eq.{validated_email}"})
    if existing_profiles:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists.")

    supabase = get_supabase_admin()
    auth_user_id = None

    async def rollback_user_creation():
        if not auth_user_id:
            return
        try:
            await postgrest_delete("users", {"id": f"eq.{auth_user_id}"})
        except Exception as cleanup_error:
            logger.error(f"Failed to remove profile for {auth_user_id}: {cleanup_error}")
        try:
            supabase.auth.admin.delete_user(auth_user_id)
        except Exception as cleanup_error:
            logger.error(f"Failed to remove auth user {auth_user_id}: {cleanup_error}")

    try:
        create_payload = {
            "email": validated_email,
            "user_metadata": {
                "name": user_in.name,
                "role": user_in.role.value
            },
            "email_confirm": True
        }
        if user_in.password:
            create_payload["password"] = user_in.password

        auth_user_res = supabase.auth.admin.create_user(create_payload)
        if auth_user_res and auth_user_res.user:
            auth_user_id = str(auth_user_res.user.id)

        if not auth_user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to obtain Supabase Auth user ID"
            )

        profile_data = {
            "id": auth_user_id,
            "name": user_in.name,
            "email": validated_email,
            "role": user_in.role.value,
            "status": AccountStatus.ACTIVE.value,
            "created_by": str(admin_user.id)
        }

        await postgrest_post("users", profile_data)

        # Retrieve the inserted record with database-generated timestamps.
        fresh_records = await postgrest_get("users", {"id": f"eq.{auth_user_id}"})
        if fresh_records:
            created_profile = fresh_records[0]
        else:
            now_iso = datetime.utcnow()
            created_profile = {
                **profile_data,
                "created_at": now_iso,
                "updated_at": now_iso
            }

        from app.services.email_service import send_user_welcome_email
        try:
            email_sent = await send_user_welcome_email(
                user_name=user_in.name,
                email=validated_email,
                password=user_in.password,
                role=user_in.role.value
            )
        except Exception as email_error:
            logger.error(f"Welcome email failed for {validated_email}: {email_error}")
            email_sent = False

        try:
            await log_activity(
                user_id=admin_user.id,
                action="create_user",
                entity_type="user",
                entity_id=UUID(auth_user_id),
                details={"email": validated_email, "role": user_in.role.value},
                ip_address=client_ip
            )
        except Exception as audit_error:
            logger.warning(f"Could not log creation of user {auth_user_id}: {audit_error}")

        return AdminUserCreateResult(user=UserResponse(**created_profile), email_sent=email_sent)
    except HTTPException:
        await rollback_user_creation()
        raise
    except Exception as e:
        await rollback_user_creation()
        if "already registered" in str(e).lower() or "already exists" in str(e).lower():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A Supabase account with this email already exists.")
        logger.error(f"Error creating user {validated_email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {str(e)}"
        )

async def delete_user(
    user_id: UUID,
    admin_user: UserResponse,
    client_ip: Optional[str] = None
) -> None:
    """Permanently deletes a user from Supabase Auth and the application profile."""
    if user_id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot delete their own account."
        )

    await get_user_by_id(user_id)
    supabase = get_supabase_admin()
    try:
        supabase.auth.admin.delete_user(str(user_id))
        await postgrest_delete("users", {"id": f"eq.{str(user_id)}"})
    except Exception as e:
        logger.error(f"Failed to delete user {user_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete user account.")

    try:
        await log_activity(
            user_id=admin_user.id,
            action="delete_user",
            entity_type="user",
            entity_id=user_id,
            ip_address=client_ip
        )
    except Exception as audit_error:
        logger.warning(f"Could not log deletion of user {user_id}: {audit_error}")

async def list_users(
    role: Optional[UserRole] = None,
    status_filter: Optional[AccountStatus] = None,
    page: int = 1,
    page_size: int = 20
) -> Tuple[List[UserResponse], int]:
    """Lists users with optional filters and pagination."""
    params: Dict[str, Any] = {
        "select": "*",
        "order": "created_at.desc",
        "limit": str(page_size),
        "offset": str((page - 1) * page_size)
    }
    if role:
        params["role"] = f"eq.{role.value}"
    if status_filter:
        params["status"] = f"eq.{status_filter.value}"

    data = await postgrest_get("users", params=params)
    users = [UserResponse(**u) for u in data]

    # Total count
    count_data = await postgrest_get("users", params={"select": "id"})
    total = len(count_data)

    return users, total

async def get_user_by_id(user_id: UUID) -> UserResponse:
    """Fetches single user profile by UUID."""
    data = await postgrest_get("users", {"id": f"eq.{str(user_id)}"})
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse(**data[0])

async def update_user(
    user_id: UUID,
    user_update: UserUpdate,
    admin_user: UserResponse,
    client_ip: Optional[str] = None
) -> UserResponse:
    """Updates user information (name, role)."""
    current = await get_user_by_id(user_id)
    payload: Dict[str, Any] = {"updated_at": "now()"}
    if user_update.name is not None:
        payload["name"] = user_update.name
    if user_update.role is not None:
        payload["role"] = user_update.role.value

    updated = await postgrest_patch("users", payload, {"id": f"eq.{str(user_id)}"})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await log_activity(
        user_id=admin_user.id,
        action="update_user",
        entity_type="user",
        entity_id=user_id,
        details=payload,
        ip_address=client_ip
    )
    return UserResponse(**updated[0])

async def update_user_status(
    user_id: UUID,
    status_update: UserStatusUpdate,
    admin_user: UserResponse,
    client_ip: Optional[str] = None
) -> UserResponse:
    """Suspends, activates, or deactivates a user account."""
    if user_id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot modify their own account status."
        )

    payload = {
        "status": status_update.status.value,
        "updated_at": "now()"
    }
    updated = await postgrest_patch("users", payload, {"id": f"eq.{str(user_id)}"})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await log_activity(
        user_id=admin_user.id,
        action=f"user_{status_update.status.value}",
        entity_type="user",
        entity_id=user_id,
        details={"new_status": status_update.status.value},
        ip_address=client_ip
    )
    return UserResponse(**updated[0])
