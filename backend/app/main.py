import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from app.core.config import settings
from app.api.v1.routes import (
    health, auth, users, powerhouses, generation, imports,
    analytics, correlation, targets, forecasts, anomalies,
    notifications, reports, activity_logs
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("shpmfs")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description=(
        "Centralized REST API for Smart Hydro Power Monitoring & Forecasting System (SHPMFS). "
        "Serves both Flutter mobile app and React web frontend from a single backend."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Centralized Error Handlers
# ---------------------------------------------------------------------------
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = []
    for err in exc.errors():
        field = " -> ".join(str(loc) for loc in err.get("loc", []))
        errors.append({"field": field, "message": err.get("msg")})
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"success": False, "message": "Validation error", "errors": errors}
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"success": False, "message": "Internal server error. Please contact the system administrator."}
    )

# ---------------------------------------------------------------------------
# Include ALL Routers under /api/v1  (primary — used by Flutter + frontend)
# ---------------------------------------------------------------------------
V1 = settings.API_V1_PREFIX  # "/api/v1"

app.include_router(health.router,          prefix=V1)
app.include_router(auth.router,            prefix=V1)
app.include_router(users.router,           prefix=V1)
app.include_router(powerhouses.router,     prefix=V1)
app.include_router(generation.router,      prefix=V1)
app.include_router(imports.router,         prefix=V1)
app.include_router(analytics.router,       prefix=V1)
app.include_router(analytics.dashboard_router, prefix=V1)
app.include_router(correlation.router,     prefix=V1)
app.include_router(targets.router,         prefix=V1)
app.include_router(forecasts.router,       prefix=V1)
app.include_router(anomalies.router,       prefix=V1)
app.include_router(notifications.router,   prefix=V1)
app.include_router(reports.router,         prefix=V1)
app.include_router(activity_logs.router,   prefix=V1)

# ---------------------------------------------------------------------------
# Legacy /api prefix aliases — matches frontend baseURL=http://localhost:8000/api/v1
# These are NOT needed if frontend is updated to /api/v1. Kept for safety.
# ---------------------------------------------------------------------------
app.include_router(health.router,              prefix="/api")
app.include_router(auth.router,                prefix="/api")
app.include_router(powerhouses.router,         prefix="/api")
app.include_router(generation.router,          prefix="/api")
app.include_router(analytics.dashboard_router, prefix="/api")
app.include_router(targets.router,             prefix="/api")
app.include_router(forecasts.router,           prefix="/api")
app.include_router(reports.router,             prefix="/api")
app.include_router(activity_logs.router,       prefix="/api")

# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------
@app.get("/", tags=["Root"])
def root():
    return {
        "success": True,
        "message": f"Welcome to {settings.PROJECT_NAME} API",
        "docs": "/docs",
        "redoc": "/redoc",
        "health": f"{V1}/health",
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
