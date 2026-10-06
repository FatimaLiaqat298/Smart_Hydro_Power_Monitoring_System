import logging
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
from fastapi import HTTPException, status
from app.db.supabase import postgrest_get, postgrest_post, postgrest_patch, postgrest_delete
from app.schemas.generation import (
    GenerationInput, GenerationPreviewInput, CalculationPreviewResponse,
    GenerationRecordResponse, GenerationRecordUpdate
)
from app.schemas.user import UserResponse
from app.services.powerhouse_service import get_powerhouse_by_id
from app.services.generation_calculation_service import calculate_derived_generation_fields
from app.services.activity_log_service import log_activity
from app.services.analytics_service import invalidate_analytics_cache

logger = logging.getLogger(__name__)

async def get_preview(input_data: GenerationPreviewInput) -> CalculationPreviewResponse:
    """Calculates preview of derived operational and financial statistics without saving to DB."""
    ph = await get_powerhouse_by_id(input_data.powerhouse_id)
    calculated = calculate_derived_generation_fields(
        avg_station_load_mw=input_data.avg_station_load_mw,
        installed_capacity_mw=ph.installed_capacity_mw,
        tariff_rate=(
            input_data.tariff_rate if input_data.tariff_rate is not None
            else ph.tariff_rate if ph.tariff_rate is not None
            else Decimal("5.0000")
        ),
        avg_annual_design_plant_factor_pct=(
            input_data.avg_annual_design_plant_factor_pct
            if input_data.avg_annual_design_plant_factor_pct is not None
            else ph.avg_annual_design_plant_factor_pct
            if ph.avg_annual_design_plant_factor_pct is not None
            else Decimal("65.00")
        ),
        aux_consumption_kwh=input_data.aux_consumption_kwh,
        remarks=input_data.remarks,
        total_daily_units_kwh=input_data.total_daily_units_kwh,
        daily_net_energy_kwh=input_data.daily_net_energy_kwh,
        expected_generation_gwh=input_data.expected_generation_gwh,
        expected_revenue_pkr=input_data.expected_revenue_pkr
    )
    return CalculationPreviewResponse(**calculated)

async def create_record(
    input_data: GenerationInput,
    user: UserResponse,
    client_ip: Optional[str] = None,
    source: str = "manual"
) -> GenerationRecordResponse:
    """
    Creates a new generation record. Automatically derives all calculated fields,
    snapshots tariff & design PF, saves to Supabase, and triggers audit logging.
    """
    ph = await get_powerhouse_by_id(input_data.powerhouse_id)

    calculated = calculate_derived_generation_fields(
        avg_station_load_mw=input_data.avg_station_load_mw,
        installed_capacity_mw=ph.installed_capacity_mw,
        tariff_rate=(
            input_data.tariff_rate if input_data.tariff_rate is not None
            else ph.tariff_rate if ph.tariff_rate is not None
            else Decimal("5.0000")
        ),
        avg_annual_design_plant_factor_pct=(
            input_data.avg_annual_design_plant_factor_pct
            if input_data.avg_annual_design_plant_factor_pct is not None
            else ph.avg_annual_design_plant_factor_pct
            if ph.avg_annual_design_plant_factor_pct is not None
            else Decimal("65.00")
        ),
        aux_consumption_kwh=input_data.aux_consumption_kwh,
        remarks=input_data.remarks,
        total_daily_units_kwh=input_data.total_daily_units_kwh,
        daily_net_energy_kwh=input_data.daily_net_energy_kwh,
        expected_generation_gwh=input_data.expected_generation_gwh,
        expected_revenue_pkr=input_data.expected_revenue_pkr
    )

    # Check duplicate reading
    params = {
        "powerhouse_id": f"eq.{str(input_data.powerhouse_id)}",
        "reading_date": f"eq.{input_data.reading_date.isoformat()}"
    }
    if input_data.time_slot:
        params["time_slot"] = f"eq.{input_data.time_slot.isoformat()}"
    else:
        params["time_slot"] = "is.null"

    existing = await postgrest_get("generation_records", params)
    if existing and input_data.time_slot:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A generation record already exists for powerhouse {ph.name} on date {input_data.reading_date}."
        )

    for reading in input_data.inflow_readings:
        reading_params = {
            "powerhouse_id": f"eq.{str(input_data.powerhouse_id)}",
            "reading_date": f"eq.{input_data.reading_date.isoformat()}",
            "time_slot": f"eq.{reading.time_slot.isoformat()}",
        }
        reading_payload = {
            "powerhouse_id": str(input_data.powerhouse_id),
            "reading_date": input_data.reading_date.isoformat(),
            "time_slot": reading.time_slot.isoformat(),
            "station_load_mw": float(input_data.avg_station_load_mw),
            "inflow_cumecs": float(reading.inflow_cumecs),
        }
        existing_reading = await postgrest_get("intraday_readings", reading_params)
        if existing_reading:
            await postgrest_patch(
                "intraday_readings", reading_payload,
                {"id": f"eq.{existing_reading[0]['id']}"}
            )
        else:
            await postgrest_post("intraday_readings", reading_payload)

    intraday_rows = await postgrest_get("intraday_readings", {
        "powerhouse_id": f"eq.{str(input_data.powerhouse_id)}",
        "reading_date": f"eq.{input_data.reading_date.isoformat()}",
        "select": "inflow_cumecs",
    })
    inflow_values = [Decimal(str(row["inflow_cumecs"])) for row in intraday_rows if row.get("inflow_cumecs") is not None]
    if inflow_values:
        daily_average_inflow = sum(inflow_values) / Decimal(len(inflow_values))
    else:
        daily_average_inflow = input_data.actual_avg_inflow_cumecs

    payload = {
        "powerhouse_id": str(input_data.powerhouse_id),
        "reading_date": input_data.reading_date.isoformat(),
        "time_slot": input_data.time_slot.isoformat() if input_data.time_slot else None,
        "max_station_load_mw": float(input_data.max_station_load_mw) if input_data.max_station_load_mw is not None else None,
        "avg_station_load_mw": float(input_data.avg_station_load_mw),
        "actual_avg_inflow_cumecs": float(daily_average_inflow) if daily_average_inflow is not None else None,
        "avg_historical_hydrology": float(input_data.avg_historical_hydrology) if input_data.avg_historical_hydrology is not None else None,
        "remarks": input_data.remarks,
        "entered_by": str(user.id),
        "source": source,

        # Automatically calculated fields
        "total_daily_units_kwh": float(calculated["total_daily_units_kwh"]),
        "aux_consumption_kwh": float(calculated["aux_consumption_kwh"]),
        "daily_net_energy_kwh": float(calculated["daily_net_energy_kwh"]),
        "daily_plant_factor_pct": float(calculated["daily_plant_factor_pct"]),
        "expected_generation_gwh": float(calculated["expected_generation_gwh"]),
        "expected_revenue_pkr": float(calculated["expected_revenue_pkr"]),
        "actual_revenue_pkr": float(calculated["actual_revenue_pkr"]),
        "revenue_difference_pkr": float(calculated["revenue_difference_pkr"]),
        "tariff_rate": float(calculated["tariff_rate"]),
        "avg_annual_design_plant_factor_pct": float(calculated["avg_annual_design_plant_factor_pct"]),
        "outage_flag": calculated["outage_flag"],
        "canal_closure_flag": calculated["canal_closure_flag"]
    }

    if existing:
        res = await postgrest_patch(
            "generation_records", payload,
            {"id": f"eq.{existing[0]['id']}"}
        )
    else:
        res = await postgrest_post("generation_records", payload)
    created = res[0] if isinstance(res, list) else res
    created["powerhouse_name"] = ph.name

    invalidate_analytics_cache()

    await log_activity(
        user_id=user.id,
        action="update_generation_record" if existing else "create_generation_record",
        entity_type="generation_record",
        entity_id=UUID(created["id"]),
        details={
            "powerhouse": ph.name,
            "reading_date": input_data.reading_date.isoformat(),
            "avg_station_load_mw": float(input_data.avg_station_load_mw)
        },
        ip_address=client_ip
    )

    try:
        from app.services.anomaly_service import evaluate_and_create_anomaly
        await evaluate_and_create_anomaly(created, ph)
    except Exception as e:
        logger.warning(f"Anomaly evaluation deferred: {e}")

    return GenerationRecordResponse(**created)

async def list_records(
    powerhouse_id: Optional[UUID] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    source: Optional[str] = None,
    page: int = 1,
    page_size: int = 20
) -> Tuple[List[GenerationRecordResponse], int]:
    """Fetches generation records with filters and pagination."""
    params: Dict[str, Any] = {
        "select": "*,powerhouses(name)",
        "order": "reading_date.desc,created_at.desc",
        "limit": str(page_size),
        "offset": str((page - 1) * page_size)
    }
    count_params: Dict[str, Any] = {"select": "id"}

    if powerhouse_id:
        params["powerhouse_id"] = f"eq.{str(powerhouse_id)}"
        count_params["powerhouse_id"] = f"eq.{str(powerhouse_id)}"
    if date_from and date_to:
        date_filter = f"(reading_date.gte.{date_from},reading_date.lte.{date_to})"
        params["and"] = date_filter
        count_params["and"] = date_filter
    elif date_from:
        params["reading_date"] = f"gte.{date_from}"
        count_params["reading_date"] = f"gte.{date_from}"
    elif date_to:
        params["reading_date"] = f"lte.{date_to}"
        count_params["reading_date"] = f"lte.{date_to}"
    if source:
        params["source"] = f"eq.{source}"
        count_params["source"] = f"eq.{source}"

    data = await postgrest_get("generation_records", params=params)
    records = []
    for item in data:
        ph_info = item.pop("powerhouses", None)
        item["powerhouse_name"] = ph_info.get("name") if isinstance(ph_info, dict) else None
        records.append(GenerationRecordResponse(**item))

    count_data = await postgrest_get("generation_records", params=count_params)
    total = len(count_data)

    return records, total

async def get_record_by_id(record_id: UUID) -> GenerationRecordResponse:
    """Fetches single generation record by ID."""
    data = await postgrest_get("generation_records", {"id": f"eq.{str(record_id)}", "select": "*,powerhouses(name)"})
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation record not found")
    item = data[0]
    ph_info = item.pop("powerhouses", None)
    item["powerhouse_name"] = ph_info.get("name") if isinstance(ph_info, dict) else None
    return GenerationRecordResponse(**item)

async def update_record(
    record_id: UUID,
    update_data: GenerationRecordUpdate,
    user: UserResponse,
    client_ip: Optional[str] = None
) -> GenerationRecordResponse:
    """
    Updates a generation record and automatically recalculates all affected derived fields per Section 56.10.
    """
    existing = await get_record_by_id(record_id)
    ph = await get_powerhouse_by_id(existing.powerhouse_id)

    new_avg_mw = update_data.avg_station_load_mw if update_data.avg_station_load_mw is not None else existing.avg_station_load_mw
    new_remarks = update_data.remarks if update_data.remarks is not None else existing.remarks
    new_aux_kwh = update_data.aux_consumption_kwh if update_data.aux_consumption_kwh is not None else existing.aux_consumption_kwh
    new_total_kwh = update_data.total_daily_units_kwh if update_data.total_daily_units_kwh is not None else existing.total_daily_units_kwh
    new_net_kwh = update_data.daily_net_energy_kwh if update_data.daily_net_energy_kwh is not None else existing.daily_net_energy_kwh

    calculated = calculate_derived_generation_fields(
        avg_station_load_mw=new_avg_mw,
        installed_capacity_mw=ph.installed_capacity_mw,
        tariff_rate=existing.tariff_rate or ph.tariff_rate or Decimal("5.0000"),
        avg_annual_design_plant_factor_pct=existing.avg_annual_design_plant_factor_pct or ph.avg_annual_design_plant_factor_pct or Decimal("65.00"),
        aux_consumption_kwh=new_aux_kwh,
        remarks=new_remarks,
        total_daily_units_kwh=new_total_kwh,
        daily_net_energy_kwh=new_net_kwh
    )

    payload = {
        "updated_at": "now()",
        "avg_station_load_mw": float(new_avg_mw),
        "remarks": new_remarks,
        "total_daily_units_kwh": float(calculated["total_daily_units_kwh"]),
        "aux_consumption_kwh": float(calculated["aux_consumption_kwh"]),
        "daily_net_energy_kwh": float(calculated["daily_net_energy_kwh"]),
        "daily_plant_factor_pct": float(calculated["daily_plant_factor_pct"]),
        "expected_generation_gwh": float(calculated["expected_generation_gwh"]),
        "expected_revenue_pkr": float(calculated["expected_revenue_pkr"]),
        "actual_revenue_pkr": float(calculated["actual_revenue_pkr"]),
        "revenue_difference_pkr": float(calculated["revenue_difference_pkr"]),
        "outage_flag": calculated["outage_flag"],
        "canal_closure_flag": calculated["canal_closure_flag"]
    }
    if update_data.max_station_load_mw is not None:
        payload["max_station_load_mw"] = float(update_data.max_station_load_mw)
    if update_data.actual_avg_inflow_cumecs is not None:
        payload["actual_avg_inflow_cumecs"] = float(update_data.actual_avg_inflow_cumecs)
    if update_data.avg_historical_hydrology is not None:
        payload["avg_historical_hydrology"] = float(update_data.avg_historical_hydrology)
    if update_data.total_daily_units_kwh is not None:
        payload["total_daily_units_kwh"] = float(calculated["total_daily_units_kwh"])
    if update_data.daily_net_energy_kwh is not None:
        payload["daily_net_energy_kwh"] = float(calculated["daily_net_energy_kwh"])
    if update_data.time_slot is not None:
        payload["time_slot"] = update_data.time_slot.isoformat()

    updated = await postgrest_patch("generation_records", payload, {"id": f"eq.{str(record_id)}"})
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Generation record not found")

    res_item = updated[0]
    res_item["powerhouse_name"] = ph.name

    invalidate_analytics_cache()

    await log_activity(
        user_id=user.id,
        action="update_generation_record",
        entity_type="generation_record",
        entity_id=record_id,
        details={"avg_station_load_mw": float(new_avg_mw), "recalculated": True},
        ip_address=client_ip
    )

    return GenerationRecordResponse(**res_item)

async def delete_record(record_id: UUID, user: UserResponse, client_ip: Optional[str] = None) -> bool:
    """Deletes generation record (admin only)."""
    await postgrest_delete("generation_records", {"id": f"eq.{str(record_id)}"})
    invalidate_analytics_cache()
    await log_activity(
        user_id=user.id,
        action="delete_generation_record",
        entity_type="generation_record",
        entity_id=record_id,
        ip_address=client_ip
    )
    return True
