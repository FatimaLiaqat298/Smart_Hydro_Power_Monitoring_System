from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID
from pydantic import BaseModel
from enum import Enum

class AnomalySeverity(str, Enum):
    SIGMA_ALERT = "sigma_alert"
    BAND_BREACH = "band_breach"

class AnomalyStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    DISMISSED = "dismissed"
    ESCALATED = "escalated"

class AnomalyResponse(BaseModel):
    id: UUID
    powerhouse_id: UUID
    generation_record_id: UUID
    forecast_result_id: Optional[UUID] = None
    anomaly_date: str
    actual_mw: Decimal
    predicted_mw: Optional[Decimal] = None
    error_mw: Optional[Decimal] = None
    severity: AnomalySeverity
    root_cause_insight: Optional[str] = None
    confidence: Optional[Decimal] = None
    status: AnomalyStatus
    acknowledged_by: Optional[UUID] = None
    acknowledged_at: Optional[datetime] = None
    created_at: datetime
    powerhouse_name: Optional[str] = None

class AnomalyAcknowledgeRequest(BaseModel):
    note: Optional[str] = None
