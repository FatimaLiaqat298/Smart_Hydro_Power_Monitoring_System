import io
from datetime import date
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.user import UserResponse
from app.core.dependencies import get_current_user, require_manager_or_admin
from app.services import report_service

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("", response_model=PaginatedResponse[dict])
async def list_reports(
    powerhouse_id: Optional[UUID] = Query(None),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    user: UserResponse = Depends(get_current_user)
):
    """List all generated reports."""
    data, total = await report_service.list_reports(powerhouse_id, page, page_size)
    return PaginatedResponse(success=True, message="Reports retrieved", data=data,
        pagination=PaginationMeta(page=page, page_size=page_size, total=total,
                                  total_pages=(total + page_size - 1) // page_size if total else 1))

@router.post("/generate", status_code=status.HTTP_200_OK)
async def generate_report(
    date_from: date = Query(..., description="Start date (YYYY-MM-DD)"),
    date_to: date = Query(..., description="End date (YYYY-MM-DD)"),
    format_: str = Query("pdf", alias="format", description="Output format: pdf or xlsx"),
    powerhouse_id: Optional[UUID] = Query(None, description="Filter by powerhouse (omit = all)"),
    request: Request = None,
    user: UserResponse = Depends(require_manager_or_admin)
):
    """
    Generate a PDF or XLSX report for the given date range.
    Returns the file as a binary download. Also saves metadata to DB and sends notification.
    """
    format_ = format_.lower()
    if format_ not in ("pdf", "xlsx"):
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Format must be 'pdf' or 'xlsx'")
    result = await report_service.generate_report(
        date_from, date_to, format_, powerhouse_id, user,
        client_ip=request.client.host if request and request.client else None
    )
    file_bytes = result.pop("file_bytes")
    content_type = result.pop("content_type")
    suffix = result.pop("suffix")
    filename = f"SHPMFS_Report_{date_from}_{date_to}.{suffix}"
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@router.get("/{report_id}", response_model=ApiResponse[dict])
async def get_report(report_id: UUID, user: UserResponse = Depends(get_current_user)):
    """Get report metadata and summary JSON by ID."""
    data = await report_service.get_report_by_id(report_id)
    return ApiResponse(success=True, message="Report retrieved", data=data)
