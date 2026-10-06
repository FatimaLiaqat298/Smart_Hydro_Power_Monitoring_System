from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.generation import ImportSummaryResponse
from app.schemas.user import UserResponse
from app.core.dependencies import require_operational, get_current_user
from app.services import import_service
from app.db.supabase import postgrest_get

router = APIRouter(prefix="/imports", tags=["Bulk Dataset Imports"])

@router.post("/csv", response_model=ApiResponse[ImportSummaryResponse], status_code=status.HTTP_200_OK)
async def import_csv_dataset(
    request: Request,
    file: UploadFile = File(..., description="CSV file of historical generation/hydrology data"),
    user: UserResponse = Depends(require_operational)
):
    """
    Import historical data from CSV file.
    Validates headers, data types, powerhouse names, performs server-side calculations,
    inserts records, and logs audit record.
    """
    client_ip = request.client.host if request.client else None
    res = await import_service.process_file_import(file, "csv", user, client_ip)
    return ApiResponse(
        success=True,
        message=f"Import complete: {res.rows_imported} imported, {res.rows_rejected} rejected",
        data=res
    )

@router.post("/excel", response_model=ApiResponse[ImportSummaryResponse], status_code=status.HTTP_200_OK)
async def import_excel_dataset(
    request: Request,
    file: UploadFile = File(..., description="Excel (.xlsx) file of historical generation/hydrology data"),
    user: UserResponse = Depends(require_operational)
):
    """
    Import historical data from Excel file.
    Validates Generation Data sheet, powerhouse names, performs server-side calculations,
    inserts records, and logs audit record.
    """
    client_ip = request.client.host if request.client else None
    res = await import_service.process_file_import(file, "xlsx", user, client_ip)
    return ApiResponse(
        success=True,
        message=f"Excel import complete: {res.rows_imported} imported, {res.rows_rejected} rejected",
        data=res
    )

@router.get("", response_model=PaginatedResponse[dict], status_code=status.HTTP_200_OK)
async def list_data_imports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: UserResponse = Depends(get_current_user)
):
    """List data import history and audit logs from data_imports table."""
    params = {
        "select": "*",
        "order": "created_at.desc",
        "limit": str(page_size),
        "offset": str((page - 1) * page_size)
    }
    data = await postgrest_get("data_imports", params)
    count_data = await postgrest_get("data_imports", {"select": "id"})
    total = len(count_data)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return PaginatedResponse(
        success=True,
        message="Data import history retrieved",
        data=data,
        pagination=PaginationMeta(
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages
        )
    )

@router.get("/{import_id}", response_model=ApiResponse[dict], status_code=status.HTTP_200_OK)
async def get_data_import_detail(
    import_id: UUID,
    user: UserResponse = Depends(get_current_user)
):
    """Get details and error summary for a specific import job."""
    data = await postgrest_get("data_imports", {"id": f"eq.{str(import_id)}"})
    if not data:
        return ApiResponse(success=False, message="Import record not found", data=None)
    return ApiResponse(success=True, message="Import details retrieved", data=data[0])
