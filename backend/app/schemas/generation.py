from datetime import date, time, datetime
from decimal import Decimal
from typing import Optional, List, Any, Dict
from uuid import UUID
from pydantic import BaseModel, Field, model_validator

def validate_energy_values(total_units, net_energy, auxiliary):
    if total_units is not None and net_energy is not None and net_energy > total_units:
        raise ValueError("Daily net energy cannot exceed total daily units.")
    if total_units is not None and auxiliary is not None and auxiliary > total_units:
        raise ValueError("Auxiliary consumption cannot exceed total daily units.")

class IntradayInflowInput(BaseModel):
    time_slot: time
    inflow_cumecs: Decimal = Field(..., ge=0)

class GenerationInput(BaseModel):
    powerhouse_id: UUID
    reading_date: date
    time_slot: Optional[time] = None
    inflow_readings: List[IntradayInflowInput] = Field(default_factory=list)

    # Operational inputs entered by engineer
    avg_station_load_mw: Decimal = Field(..., ge=0, description="Average station load in MW")
    max_station_load_mw: Optional[Decimal] = Field(None, ge=0)
    actual_avg_inflow_cumecs: Optional[Decimal] = Field(None, ge=0)
    avg_historical_hydrology: Optional[Decimal] = Field(None, ge=0)
    total_daily_units_kwh: Optional[Decimal] = Field(None, ge=0)
    daily_net_energy_kwh: Optional[Decimal] = Field(None, ge=0)
    aux_consumption_kwh: Optional[Decimal] = Field(None, ge=0, description="Derived from total and net energy when possible")
    tariff_rate: Optional[Decimal] = Field(None, ge=0)
    avg_annual_design_plant_factor_pct: Optional[Decimal] = Field(None, ge=0, le=100)
    expected_generation_gwh: Optional[Decimal] = Field(None, ge=0)
    expected_revenue_pkr: Optional[Decimal] = Field(None, ge=0)
    remarks: Optional[str] = None

    @model_validator(mode="after")
    def validate_generation_energy_readings(self):
        validate_energy_values(self.total_daily_units_kwh, self.daily_net_energy_kwh, self.aux_consumption_kwh)
        return self

class GenerationPreviewInput(BaseModel):
    powerhouse_id: UUID
    avg_station_load_mw: Decimal = Field(..., ge=0)
    max_station_load_mw: Optional[Decimal] = None
    actual_avg_inflow_cumecs: Optional[Decimal] = None
    total_daily_units_kwh: Optional[Decimal] = Field(None, ge=0)
    daily_net_energy_kwh: Optional[Decimal] = Field(None, ge=0)
    aux_consumption_kwh: Optional[Decimal] = None
    tariff_rate: Optional[Decimal] = Field(None, ge=0)
    avg_annual_design_plant_factor_pct: Optional[Decimal] = Field(None, ge=0, le=100)
    expected_generation_gwh: Optional[Decimal] = Field(None, ge=0)
    expected_revenue_pkr: Optional[Decimal] = Field(None, ge=0)
    remarks: Optional[str] = None

class CalculationPreviewResponse(BaseModel):
    total_daily_units_kwh: Decimal
    aux_consumption_kwh: Decimal
    aux_consumption_source: str  # 'actual' | 'estimated'
    daily_net_energy_kwh: Decimal
    daily_plant_factor_pct: Decimal
    expected_generation_gwh: Decimal
    expected_revenue_pkr: Decimal
    actual_revenue_pkr: Decimal
    revenue_difference_pkr: Decimal
    outage_flag: bool
    canal_closure_flag: bool
    tariff_rate: Decimal
    avg_annual_design_plant_factor_pct: Decimal

class GenerationRecordUpdate(BaseModel):
    avg_station_load_mw: Optional[Decimal] = Field(None, ge=0)
    max_station_load_mw: Optional[Decimal] = Field(None, ge=0)
    actual_avg_inflow_cumecs: Optional[Decimal] = Field(None, ge=0)
    avg_historical_hydrology: Optional[Decimal] = Field(None, ge=0)
    total_daily_units_kwh: Optional[Decimal] = Field(None, ge=0)
    daily_net_energy_kwh: Optional[Decimal] = Field(None, ge=0)
    aux_consumption_kwh: Optional[Decimal] = Field(None, ge=0)
    remarks: Optional[str] = None

    @model_validator(mode="after")
    def validate_preview_energy_readings(self):
        validate_energy_values(self.total_daily_units_kwh, self.daily_net_energy_kwh, self.aux_consumption_kwh)
        return self
    time_slot: Optional[time] = None

    @model_validator(mode="after")
    def validate_update_energy_readings(self):
        validate_energy_values(self.total_daily_units_kwh, self.daily_net_energy_kwh, self.aux_consumption_kwh)
        return self

class GenerationRecordResponse(BaseModel):
    id: UUID
    powerhouse_id: UUID
    reading_date: date
    time_slot: Optional[time] = None

    max_station_load_mw: Optional[Decimal] = None
    avg_station_load_mw: Decimal
    total_daily_units_kwh: Optional[Decimal] = None
    daily_net_energy_kwh: Optional[Decimal] = None

    actual_avg_inflow_cumecs: Optional[Decimal] = None
    avg_historical_hydrology: Optional[Decimal] = None

    daily_plant_factor_pct: Optional[Decimal] = None
    avg_annual_design_plant_factor_pct: Optional[Decimal] = None

    tariff_rate: Optional[Decimal] = None
    expected_generation_gwh: Optional[Decimal] = None
    expected_revenue_pkr: Optional[Decimal] = None
    actual_revenue_pkr: Optional[Decimal] = None
    revenue_difference_pkr: Optional[Decimal] = None
    aux_consumption_kwh: Optional[Decimal] = None

    remarks: Optional[str] = None
    outage_flag: bool
    canal_closure_flag: bool

    entered_by: UUID
    source: str
    created_at: datetime
    updated_at: datetime

    # Plant name joined for frontend convenience
    powerhouse_name: Optional[str] = None

    class Config:
        from_attributes = True

class ImportSummaryResponse(BaseModel):
    import_id: UUID
    file_name: str
    file_type: str
    rows_total: int
    rows_imported: int
    rows_rejected: int
    errors: List[Dict[str, Any]]
