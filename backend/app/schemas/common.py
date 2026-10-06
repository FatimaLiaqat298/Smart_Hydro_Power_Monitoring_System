from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")

class PaginationMeta(BaseModel):
    page: int = 1
    page_size: int = 20
    total: int = 0
    total_pages: int = 1

class ApiResponse(BaseModel, Generic[T]):
    success: bool = True
    message: Optional[str] = None
    data: Optional[T] = None

class PaginatedResponse(BaseModel, Generic[T]):
    success: bool = True
    message: Optional[str] = None
    data: List[T] = []
    pagination: PaginationMeta

class HealthResponse(BaseModel):
    status: str
    database: str
    supabase_auth: str
    version: str = "1.0.0"
    environment: str
