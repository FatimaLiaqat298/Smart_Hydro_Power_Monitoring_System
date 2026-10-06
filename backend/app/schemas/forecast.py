from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel


class ForecastRunRequest(BaseModel):
    powerhouse_id: Optional[UUID] = None  # None = all powerhouses
    origin_date: date
    horizon_days: int = 7
    scenario: str = "median_inflow"
    model_version: Optional[str] = None


class ForecastResultResponse(BaseModel):
    id: UUID
    powerhouse_id: UUID
    origin_date: date
    target_date: date
    horizon_days: int
    predicted_mw: Decimal
    pi80_lower_mw: Optional[Decimal] = None
    pi80_upper_mw: Optional[Decimal] = None
    sigma_threshold_mw: Optional[Decimal] = None
    p_online: Optional[Decimal] = None
    model_version: Optional[str] = None
    scenario: str
    created_at: datetime
    powerhouse_name: Optional[str] = None


class ForecastRunResponse(BaseModel):
    status: str
    origin_date: str
    horizon_days: int
    powerhouses_processed: int
    records_saved: int
    message: str


# ── Live / on-demand forecast response shapes ──────────────────────────────

class ForecastPoint(BaseModel):
    target_date: str
    horizon: int
    forecast_mw: float
    pi80_lower_mw: float
    pi80_upper_mw: float
    p_online: float


class HistoryPoint(BaseModel):
    date: str
    actual_mw: float
    inflow_m3s: float


class PlantForecastResponse(BaseModel):
    plant: str
    powerhouse_id: Optional[str] = None
    origin_date: Optional[str] = None
    history: List[HistoryPoint] = []
    forecast: List[ForecastPoint] = []
    error: Optional[str] = None
