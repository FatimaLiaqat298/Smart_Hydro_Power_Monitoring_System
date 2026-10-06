from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field

class PowerhouseBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    location: Optional[str] = None
    installed_capacity_mw: Decimal = Field(..., gt=0)
    is_canal_infrastructure: bool = False
    status: str = Field("running", description="'running' | 'partial' | 'shutdown'")
    tariff_rate: Optional[Decimal] = Field(None, description="Master default tariff rate (PKR/kWh)")
    avg_annual_design_plant_factor_pct: Optional[Decimal] = Field(None, description="Master default annual design plant factor (%)")

class PowerhouseCreate(PowerhouseBase):
    pass

class PowerhouseUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    installed_capacity_mw: Optional[Decimal] = Field(None, gt=0)
    is_canal_infrastructure: Optional[bool] = None
    status: Optional[str] = None
    tariff_rate: Optional[Decimal] = None
    avg_annual_design_plant_factor_pct: Optional[Decimal] = None

class PowerhouseResponse(PowerhouseBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
