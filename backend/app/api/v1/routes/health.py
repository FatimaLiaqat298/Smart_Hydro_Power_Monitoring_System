from fastapi import APIRouter, status
from app.schemas.common import ApiResponse, HealthResponse
from app.core.config import settings
from app.db.supabase import postgrest_get
import httpx

router = APIRouter(tags=["Health"])

@router.get("/health", response_model=ApiResponse[HealthResponse], status_code=status.HTTP_200_OK)
async def check_health():
    """System health check endpoint verifying database and auth services."""
    db_status = "unhealthy"
    auth_status = "unhealthy"

    # 1. Check Database (PostgREST table query)
    try:
        await postgrest_get("powerhouses", params={"select": "id", "limit": "1"})
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    # 2. Check Supabase Auth
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(
                f"{settings.SUPABASE_URL}/auth/v1/health",
                headers={"apikey": settings.SUPABASE_ANON_KEY}
            )
            if res.status_code == 200:
                auth_status = "healthy"
            else:
                auth_status = f"status_{res.status_code}"
    except Exception as e:
        auth_status = f"unreachable: {str(e)}"

    overall_healthy = (db_status == "healthy")

    return ApiResponse(
        success=overall_healthy,
        message="System operational" if overall_healthy else "System components degraded",
        data=HealthResponse(
            status="ok" if overall_healthy else "degraded",
            database=db_status,
            supabase_auth=auth_status,
            version="1.0.0",
            environment=settings.ENVIRONMENT
        )
    )
