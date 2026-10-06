from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Request, status
from app.schemas.powerhouse import PowerhouseCreate, PowerhouseResponse, PowerhouseUpdate
from app.schemas.user import UserResponse
from app.core.dependencies import require_admin
from app.services import powerhouse_service

router = APIRouter(prefix="/powerhouses", tags=["Powerhouses"])

@router.get("", response_model=List[PowerhouseResponse], status_code=status.HTTP_200_OK)
async def list_all_powerhouses():
    """
    Get all hydro powerhouses.
    Returns array of powerhouse master records with installed capacity and operational status.
    Consumed directly by Web and Flutter clients.
    """
    # Auto-seed if empty
    await powerhouse_service.seed_default_powerhouses()
    return await powerhouse_service.list_powerhouses()

@router.get("/{powerhouse_id}", response_model=PowerhouseResponse, status_code=status.HTTP_200_OK)
async def get_powerhouse(powerhouse_id: UUID):
    """Get single powerhouse details by ID."""
    return await powerhouse_service.get_powerhouse_by_id(powerhouse_id)

@router.post("", response_model=PowerhouseResponse, status_code=status.HTTP_201_CREATED)
async def create_powerhouse(
    ph_in: PowerhouseCreate,
    request: Request,
    admin: UserResponse = Depends(require_admin)
):
    """Admin-only: create a new powerhouse."""
    client_ip = request.client.host if request.client else None
    return await powerhouse_service.create_powerhouse(ph_in, admin, client_ip)

@router.patch("/{powerhouse_id}", response_model=PowerhouseResponse, status_code=status.HTTP_200_OK)
async def update_powerhouse(
    powerhouse_id: UUID,
    ph_update: PowerhouseUpdate,
    request: Request,
    admin: UserResponse = Depends(require_admin)
):
    """Admin-only: update powerhouse operational status or details."""
    client_ip = request.client.host if request.client else None
    return await powerhouse_service.update_powerhouse(powerhouse_id, ph_update, admin, client_ip)
