from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field
from enum import Enum

class TargetPeriod(str, Enum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    CUSTOM = "custom"

class TargetCreate(BaseModel):
    powerhouse_id: UUID
    period_type: TargetPeriod = TargetPeriod.MONTHLY
    period_start: date
    period_end: date
    target_mw: Decimal = Field(..., gt=0, description="Target average station load in MW")

class TargetUpdate(BaseModel):
    period_type: Optional[TargetPeriod] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    target_mw: Optional[Decimal] = Field(None, gt=0)

class TargetResponse(BaseModel):
    id: UUID
    powerhouse_id: UUID
    period_type: TargetPeriod
    period_start: date
    period_end: date
    target_mw: Decimal
    set_by: UUID
    created_at: datetime

class PerformanceSummaryResponse(BaseModel):
    target_id: Optional[UUID] = None
    powerhouse_id: Optional[UUID] = None
    powerhouse_name: Optional[str] = None
    period_type: Optional[str] = None
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    target_mw: Optional[Decimal] = None
    actual_avg_mw: Optional[Decimal] = None
    variance_mw: Optional[Decimal] = None
    status: Optional[str] = None  # no_data | met_or_exceeded | missed
