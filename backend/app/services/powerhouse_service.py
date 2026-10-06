import logging
import time
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID
from fastapi import HTTPException, status
from app.db.supabase import postgrest_get, postgrest_post, postgrest_patch
from app.schemas.powerhouse import PowerhouseCreate, PowerhouseResponse, PowerhouseUpdate
from app.schemas.user import UserResponse
from app.services.activity_log_service import log_activity

logger = logging.getLogger(__name__)

# In-memory cache for powerhouses (600s = 10 mins)
_POWERHOUSES_CACHE: List[PowerhouseResponse] = []
_POWERHOUSES_CACHE_TIME: float = 0.0
_PH_CACHE_TTL: float = 600.0

def invalidate_powerhouse_cache():
    global _POWERHOUSES_CACHE_TIME
    _POWERHOUSES_CACHE_TIME = 0.0

# Master defaults from historical dataset (Section 56 & Generation_Data.xlsx)
POWERHOUSE_DEFAULTS = {
    "Karora HPS": {"capacity": Decimal("11.80"), "tariff": Decimal("7.7800"), "design_pf": Decimal("69.00"), "canal": False},
    "Jabori HPS": {"capacity": Decimal("10.20"), "tariff": Decimal("5.7092"), "design_pf": Decimal("79.57"), "canal": False},
    "Machai HPS": {"capacity": Decimal("2.60"), "tariff": Decimal("4.6710"), "design_pf": Decimal("70.00"), "canal": True},
    "Malakand-3 HPS": {"capacity": Decimal("81.00"), "tariff": Decimal("4.6710"), "design_pf": Decimal("65.00"), "canal": True},
    "Reshun HPS": {"capacity": Decimal("4.20"), "tariff": Decimal("5.5000"), "design_pf": Decimal("60.00"), "canal": False},
    "Koto HPS": {"capacity": Decimal("40.80"), "tariff": Decimal("6.2000"), "design_pf": Decimal("65.00"), "canal": False},
    "Daral Khwar HPS": {"capacity": Decimal("36.60"), "tariff": Decimal("6.5000"), "design_pf": Decimal("70.00"), "canal": False},
    "Shishi HPS": {"capacity": Decimal("1.875"), "tariff": Decimal("5.2000"), "design_pf": Decimal("55.00"), "canal": False},
    "Pehur HPS": {"capacity": Decimal("18.00"), "tariff": Decimal("4.6710"), "design_pf": Decimal("60.00"), "canal": True},
}

def enrich_powerhouse_dict(ph: Dict[str, Any]) -> Dict[str, Any]:
    """Enriches powerhouse record with master tariff and design plant factor defaults if null."""
    name = ph.get("name", "")
    defaults = POWERHOUSE_DEFAULTS.get(name, {})
    if ph.get("tariff_rate") is None:
        ph["tariff_rate"] = defaults.get("tariff", Decimal("5.0000"))
    if ph.get("avg_annual_design_plant_factor_pct") is None:
        ph["avg_annual_design_plant_factor_pct"] = defaults.get("design_pf", Decimal("65.00"))
    return ph

async def list_powerhouses() -> List[PowerhouseResponse]:
    """Fetches all powerhouses ordered by name with 10-min in-memory caching for speed."""
    global _POWERHOUSES_CACHE, _POWERHOUSES_CACHE_TIME
    now = time.time()
    if _POWERHOUSES_CACHE and (now - _POWERHOUSES_CACHE_TIME < _PH_CACHE_TTL):
        return _POWERHOUSES_CACHE

    data = await postgrest_get("powerhouses", {"select": "*", "order": "name.asc"})
    results = []
    for item in data:
        enrich_powerhouse_dict(item)
        results.append(PowerhouseResponse(**item))
    
    _POWERHOUSES_CACHE = results
    _POWERHOUSES_CACHE_TIME = now
    return results

async def get_powerhouse_by_id(powerhouse_id: UUID) -> PowerhouseResponse:
    """Fetches single powerhouse by UUID."""
    data = await postgrest_get("powerhouses", {"id": f"eq.{str(powerhouse_id)}"})
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Powerhouse not found")
    item = enrich_powerhouse_dict(data[0])
    return PowerhouseResponse(**item)

async def get_powerhouse_by_name(name: str) -> Optional[Dict[str, Any]]:
    """Look up powerhouse by name."""
    data = await postgrest_get("powerhouses", {"name": f"ilike.{name.strip()}"})
    if data:
        return enrich_powerhouse_dict(data[0])
    return None

async def create_powerhouse(
    ph_in: PowerhouseCreate,
    admin_user: UserResponse,
    client_ip: Optional[str] = None
) -> PowerhouseResponse:
    """Admin creates a new powerhouse."""
    existing = await get_powerhouse_by_name(ph_in.name)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Powerhouse with name '{ph_in.name}' already exists"
        )

    payload = {
        "name": ph_in.name,
        "location": ph_in.location,
        "installed_capacity_mw": float(ph_in.installed_capacity_mw),
        "is_canal_infrastructure": ph_in.is_canal_infrastructure,
        "status": ph_in.status
    }
    if ph_in.tariff_rate is not None:
        payload["tariff_rate"] = float(ph_in.tariff_rate)
    if ph_in.avg_annual_design_plant_factor_pct is not None:
        payload["avg_annual_design_plant_factor_pct"] = float(ph_in.avg_annual_design_plant_factor_pct)

    try:
        res = await postgrest_post("powerhouses", payload)
    except Exception:
        payload.pop("tariff_rate", None)
        payload.pop("avg_annual_design_plant_factor_pct", None)
        res = await postgrest_post("powerhouses", payload)

    created = res[0] if isinstance(res, list) else res
    enrich_powerhouse_dict(created)
    invalidate_powerhouse_cache()

    await log_activity(
        user_id=admin_user.id,
        action="create_powerhouse",
        entity_type="powerhouse",
        entity_id=UUID(created["id"]),
        details={"name": ph_in.name, "installed_capacity_mw": float(ph_in.installed_capacity_mw)},
        ip_address=client_ip
    )
    return PowerhouseResponse(**created)

async def update_powerhouse(
    powerhouse_id: UUID,
    ph_update: PowerhouseUpdate,
    admin_user: UserResponse,
    client_ip: Optional[str] = None
) -> PowerhouseResponse:
    """Admin updates powerhouse details."""
    payload: Dict[str, Any] = {"updated_at": "now()"}
    if ph_update.name is not None:
        payload["name"] = ph_update.name
    if ph_update.location is not None:
        payload["location"] = ph_update.location
    if ph_update.installed_capacity_mw is not None:
        payload["installed_capacity_mw"] = float(ph_update.installed_capacity_mw)
    if ph_update.is_canal_infrastructure is not None:
        payload["is_canal_infrastructure"] = ph_update.is_canal_infrastructure
    if ph_update.status is not None:
        payload["status"] = ph_update.status

    updated = await postgrest_patch("powerhouses", payload, {"id": f"eq.{str(powerhouse_id)}"})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Powerhouse not found")

    enrich_powerhouse_dict(updated[0])
    invalidate_powerhouse_cache()

    await log_activity(
        user_id=admin_user.id,
        action="update_powerhouse",
        entity_type="powerhouse",
        entity_id=powerhouse_id,
        details=payload,
        ip_address=client_ip
    )
    return PowerhouseResponse(**updated[0])

async def seed_default_powerhouses() -> int:
    """Seed the 9 PEDO powerhouses from historical records if table is empty."""
    existing = await postgrest_get("powerhouses", {"select": "id"})
    if len(existing) > 0:
        return len(existing)

    logger.info("Seeding initial 9 powerhouses...")
    for name, meta in POWERHOUSE_DEFAULTS.items():
        payload = {
            "name": name,
            "location": "Khyber Pakhtunkhwa, Pakistan",
            "installed_capacity_mw": float(meta["capacity"]),
            "is_canal_infrastructure": meta["canal"],
            "status": "running"
        }
        await postgrest_post("powerhouses", payload)
    
    seeded = await postgrest_get("powerhouses", {"select": "id"})
    invalidate_powerhouse_cache()
    return len(seeded)
