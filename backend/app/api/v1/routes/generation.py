from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request, UploadFile, File, status
from app.schemas.common import ApiResponse, PaginatedResponse, PaginationMeta
from app.schemas.generation import (
    GenerationInput, GenerationPreviewInput, CalculationPreviewResponse,
    GenerationRecordResponse, GenerationRecordUpdate, ImportSummaryResponse
)
from app.schemas.user import UserResponse
from app.core.dependencies import get_current_user, require_operational, require_admin
from app.services import generation_service, import_service

router = APIRouter(prefix="/generation", tags=["Generation Data Entry"])

@router.get("", response_model=PaginatedResponse[GenerationRecordResponse], status_code=status.HTTP_200_OK)
async def list_generation_records(
    powerhouse_id: Optional[UUID] = Query(None, description="Filter by powerhouse ID"),
    date_from: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    source: Optional[str] = Query(None, description="Filter by source ('manual', 'csv_import', 'excel_import')"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=5000),
    user: UserResponse = Depends(get_current_user)
):
    """List generation records with powerhouse, date range and source filtering."""
    records, total = await generation_service.list_records(powerhouse_id, date_from, date_to, source, page, page_size)
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1
    return PaginatedResponse(
        success=True,
        message="Generation records retrieved",
        data=records,
        pagination=PaginationMeta(
            page=page,
            page_size=page_size,
            total=total,
            total_pages=total_pages
        )
    )

@router.post("/calculate-preview", response_model=ApiResponse[CalculationPreviewResponse], status_code=status.HTTP_200_OK)
async def preview_calculation(
    preview_in: GenerationPreviewInput,
    user: UserResponse = Depends(require_operational)
):
    """
    Data Entry Preview Endpoint (Section 56.8):
    Calculates derived operational/financial statistics before the engineer clicks Save.
    """
    res = await generation_service.get_preview(preview_in)
    return ApiResponse(
        success=True,
        message="Calculation preview generated",
        data=res
    )

@router.post("", response_model=ApiResponse[GenerationRecordResponse], status_code=status.HTTP_201_CREATED)
async def create_generation_record(
    input_data: GenerationInput,
    request: Request,
    user: UserResponse = Depends(require_operational)
):
    """
    Operational Data Entry (Section 5, 56):
    Creates generation record with automatic server-side derivation of all operational/financial fields.
    """
    client_ip = request.client.host if request.client else None
    created = await generation_service.create_record(input_data, user, client_ip)
    return ApiResponse(
        success=True,
        message="Generation record created successfully",
        data=created
    )

@router.get("/{record_id}", response_model=ApiResponse[GenerationRecordResponse], status_code=status.HTTP_200_OK)
async def get_generation_record(
    record_id: UUID,
    user: UserResponse = Depends(get_current_user)
):
    """Get single generation record by ID."""
    rec = await generation_service.get_record_by_id(record_id)
    return ApiResponse(success=True, message="Record details retrieved", data=rec)

@router.patch("/{record_id}", response_model=ApiResponse[GenerationRecordResponse], status_code=status.HTTP_200_OK)
async def update_generation_record(
    record_id: UUID,
    update_data: GenerationRecordUpdate,
    request: Request,
    user: UserResponse = Depends(require_operational)
):
    """
    Update operational record (Section 56.10):
    Automatically recalculates all affected derived fields before saving.
    """
    client_ip = request.client.host if request.client else None
    updated = await generation_service.update_record(record_id, update_data, user, client_ip)
    return ApiResponse(
        success=True,
        message="Generation record updated and recalculated successfully",
        data=updated
    )

@router.delete("/{record_id}", response_model=ApiResponse[bool], status_code=status.HTTP_200_OK)
async def delete_generation_record(
    record_id: UUID,
    request: Request,
    admin: UserResponse = Depends(require_admin)
):
    """Admin-only: delete operational record."""
    client_ip = request.client.host if request.client else None
    await generation_service.delete_record(record_id, admin, client_ip)
    return ApiResponse(success=True, message="Record deleted successfully", data=True)

# Compatibility alias for frontend: POST /generation/bulk-import
@router.post("/bulk-import", response_model=ApiResponse[ImportSummaryResponse], status_code=status.HTTP_200_OK)
async def bulk_import_compatibility(
    request: Request,
    file: UploadFile = File(...),
    user: UserResponse = Depends(require_operational)
):
    """Frontend-compatible bulk import alias."""
    client_ip = request.client.host if request.client else None
    fn = (file.filename or "").lower()
    file_type = "xlsx" if fn.endswith(".xlsx") or fn.endswith(".xls") else "csv"
    res = await import_service.process_file_import(file, file_type, user, client_ip)
    return ApiResponse(success=True, message="Bulk import processed", data=res)
