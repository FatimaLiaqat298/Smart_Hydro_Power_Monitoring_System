from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
import json
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Hydro Power Monitoring & Forecasting System (SHPMFS)"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # Supabase Credentials
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_PUBLISHABLE_KEY: str = ""

    # Database
    DATABASE_URL: str = ""

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, str) and v.startswith("["):
            return json.loads(v)
        return v

    # External ML Model URLs
    MODEL_FORECAST_URL: str = "http://localhost:8001/api/forecast"
    MODEL_ANOMALY_URL: str = "http://localhost:8002/api/anomaly"

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = ""
    ADMIN_EMAIL: str = "fatimaliaqat900@gmail.com"
    MAILER_URL: str = "http://127.0.0.1:8025"

    # Supabase Storage
    SUPABASE_REPORTS_BUCKET: str = "reports"

    # Anomaly Threshold Defaults
    SIGMA_ALERT_THRESHOLD_PCT: float = 20.0  # % deviation threshold for anomaly warning

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
