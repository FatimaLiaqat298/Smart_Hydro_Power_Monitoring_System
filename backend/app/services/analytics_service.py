import logging
import time
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID
from app.db.supabase import postgrest_get
from app.services.powerhouse_service import list_powerhouses

logger = logging.getLogger(__name__)

# In-memory TTL Cache (300 seconds = 5 minutes) to ensure instant (<20ms) responses for dashboard analytics
_RECORDS_CACHE: List[Dict[str, Any]] = []
_RECORDS_CACHE_TIME: float = 0.0
_CACHE_TTL_SECONDS: float = 300.0
STATUS_DATA_CUTOFF = date(2026, 9, 19)
STATUS_STALE_DAYS = 3

def invalidate_analytics_cache():
    """Call this when new generation data is inserted/updated/imported to force fresh fetch."""
    global _RECORDS_CACHE_TIME
    _RECORDS_CACHE_TIME = 0.0
    logger.info("Analytics in-memory cache invalidated.")

async def _get_all_generation_records_cached() -> List[Dict[str, Any]]:
    """Fetches targeted generation records with 5-min in-memory caching for ultra-fast dashboard rendering."""
    global _RECORDS_CACHE, _RECORDS_CACHE_TIME
    now = time.time()
    if _RECORDS_CACHE and (now - _RECORDS_CACHE_TIME < _CACHE_TTL_SECONDS):
        return _RECORDS_CACHE

    logger.info("Fetching compact generation records from Supabase for cache...")
    # Target only columns required for analytics to reduce network payload size by 90%
    compact_select = "powerhouse_id,reading_date,avg_station_load_mw,total_daily_units_kwh,actual_revenue_pkr,actual_avg_inflow_cumecs,avg_historical_hydrology,tariff_rate,outage_flag,canal_closure_flag,daily_plant_factor_pct"
    records = await postgrest_get("generation_records", {"select": compact_select})
    _RECORDS_CACHE = records
    _RECORDS_CACHE_TIME = now
    logger.info(f"Cached {len(records)} generation records in memory.")
    return _RECORDS_CACHE

async def resolve_powerhouse_id(plant_identifier: Optional[Any]) -> Optional[str]:
    """Resolves plant name, UUID string, UUID object, or 'all' to a powerhouse UUID string or None."""
    if not plant_identifier:
        return None
    p_str = str(plant_identifier).strip()
    if p_str.lower() in ("all", "fleet", "none", ""):
        return None

    all_ph = await list_powerhouses()
    for ph in all_ph:
        if str(ph.id).lower() == p_str.lower():
            return str(ph.id)
        # Match plant name with or without 'HPS' / 'HP' suffix
        norm_ph = ph.name.lower().replace(" hps", "").replace(" hp", "").strip()
        norm_input = p_str.lower().replace(" hps", "").replace(" hp", "").strip()
        if ph.name.lower() == p_str.lower() or norm_ph == norm_input:
            return str(ph.id)
    return p_str

def _filter_records(
    records: List[Dict[str, Any]],
    powerhouse_id: Optional[Any] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Filters in-memory records by powerhouse_id and date range."""
    filtered = records
    if powerhouse_id:
        pid_str = str(powerhouse_id).strip()
        if pid_str.lower() not in ("all", "fleet", "none", ""):
            filtered = [r for r in filtered if r.get("powerhouse_id") == pid_str]
    if date_from:
        filtered = [r for r in filtered if str(r.get("reading_date", "")) >= date_from]
    if date_to:
        filtered = [r for r in filtered if str(r.get("reading_date", "")) <= date_to]
    return filtered

async def get_dashboard_kpis(
    powerhouse_id: Optional[Any] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> Dict[str, Any]:
    """Computes top-level KPI cards instantly from cached records."""
    resolved_pid = await resolve_powerhouse_id(powerhouse_id)
    all_records = await _get_all_generation_records_cached()
    records = _filter_records(all_records, resolved_pid, date_from, date_to)

    all_powerhouses = await list_powerhouses()
    if resolved_pid:
        target_ph = next((p for p in all_powerhouses if str(p.id) == resolved_pid), None)
        total_installed_cap = float(target_ph.installed_capacity_mw) if target_ph else 0.0
    else:
        total_installed_cap = sum(float(p.installed_capacity_mw) for p in all_powerhouses)

    if not records:
        return {
            "total_generation_kwh": 0, "totalKwh": 0,
            "total_generation_gwh": 0, "totalGwh": 0,
            "avg_daily_generation_mw": 0, "avgGenMW": 0,
            "avg_daily_kwh": 0, "avgDailyKwh": 0,
            "installed_capacity_mw": total_installed_cap, "installedCapacityMW": total_installed_cap,
            "avg_actual_inflow_cumecs": 0, "avgActualHydrology": 0,
            "avg_historical_hydrology": 0, "avgHistHydrology": 0,
            "total_revenue_pkr": 0, "totalRevenuePKR": 0,
            "tariff": 4.671,
            "total_records": 0, "totalRecords": 0,
            "outage_days": 0, "outageDays": 0,
            "canal_closure_days": 0, "canalClosureDays": 0
        }

    total_kwh = sum(float(r.get("total_daily_units_kwh") or 0) for r in records)
    avg_mw = sum(float(r.get("avg_station_load_mw") or 0) for r in records) / len(records)
    avg_daily_kwh = total_kwh / len(records)
    inflows = [float(r["actual_avg_inflow_cumecs"]) for r in records if r.get("actual_avg_inflow_cumecs") is not None]
    hist_hydros = [float(r["avg_historical_hydrology"]) for r in records if r.get("avg_historical_hydrology") is not None]
    total_revenue = sum(float(r.get("actual_revenue_pkr") or 0) for r in records)
    tariffs = [float(r["tariff_rate"]) for r in records if r.get("tariff_rate") is not None]
    avg_tariff = sum(tariffs) / len(tariffs) if tariffs else 4.671
    outage_days = sum(1 for r in records if r.get("outage_flag"))
    canal_days = sum(1 for r in records if r.get("canal_closure_flag"))

    return {
        # Snake_case
        "total_generation_kwh": round(total_kwh, 2),
        "total_generation_gwh": round(total_kwh / 1_000_000, 4),
        "avg_daily_generation_mw": round(avg_mw, 3),
        "avg_daily_kwh": round(avg_daily_kwh, 2),
        "installed_capacity_mw": round(total_installed_cap, 2),
        "avg_actual_inflow_cumecs": round(sum(inflows) / len(inflows), 3) if inflows else 0,
        "avg_historical_hydrology": round(sum(hist_hydros) / len(hist_hydros), 3) if hist_hydros else 0,
        "total_revenue_pkr": round(total_revenue, 2),
        "tariff": round(avg_tariff, 4),
        "total_records": len(records),
        "outage_days": outage_days,
        "canal_closure_days": canal_days,

        # CamelCase aliases for frontend components
        "totalKwh": round(total_kwh, 2),
        "totalGwh": round(total_kwh / 1_000_000, 4),
        "avgGenMW": round(avg_mw, 3),
        "avgDailyKwh": round(avg_daily_kwh, 2),
        "installedCapacityMW": round(total_installed_cap, 2),
        "avgActualHydrology": round(sum(inflows) / len(inflows), 3) if inflows else 0,
        "avgHistHydrology": round(sum(hist_hydros) / len(hist_hydros), 3) if hist_hydros else 0,
        "totalRevenuePKR": round(total_revenue, 2),
        "totalRecords": len(records),
        "outageDays": outage_days,
        "canalClosureDays": canal_days
    }

async def get_generation_trend(
    powerhouse_id: Optional[Any] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Returns daily generation trend data aggregated cleanly with 1 data point per date."""
    resolved_pid = await resolve_powerhouse_id(powerhouse_id)
    all_records = await _get_all_generation_records_cached()
    records = _filter_records(all_records, resolved_pid, date_from, date_to)

    if resolved_pid:
        records_sorted = sorted(records, key=lambda x: str(x.get("reading_date", "")))
        return [
            {
                "date": r["reading_date"],
                "avg_mw": round(float(r.get("avg_station_load_mw") or 0), 2),
                "inflow": round(float(r.get("actual_avg_inflow_cumecs") or 0), 2),
                "powerhouse_id": r.get("powerhouse_id")
            }
            for r in records_sorted
        ]
    else:
        # Fleet-wide: Aggregate by date so every date has exactly ONE clean, monotonic data point
        by_date: Dict[str, Dict[str, Any]] = {}
        for r in records:
            d = str(r.get("reading_date", ""))
            if not d:
                continue
            if d not in by_date:
                by_date[d] = {"total_mw": 0.0, "inflow_sum": 0.0, "inflow_count": 0}
            by_date[d]["total_mw"] += float(r.get("avg_station_load_mw") or 0)
            inflow_val = r.get("actual_avg_inflow_cumecs")
            if inflow_val is not None:
                by_date[d]["inflow_sum"] += float(inflow_val)
                by_date[d]["inflow_count"] += 1

        result = []
        for d in sorted(by_date.keys()):
            item = by_date[d]
            avg_inflow = round(item["inflow_sum"] / item["inflow_count"], 2) if item["inflow_count"] > 0 else 0.0
            result.append({
                "date": d,
                "avg_mw": round(item["total_mw"], 2),
                "inflow": avg_inflow,
                "powerhouse_id": "fleet"
            })
        return result

async def get_monthly_trend(
    powerhouse_id: Optional[Any] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Returns monthly aggregated generation trend grouped by year-month instantly from cache."""
    all_records = await _get_all_generation_records_cached()
    records = _filter_records(all_records, powerhouse_id, date_from, date_to)

    monthly: Dict[str, Dict[str, Any]] = {}
    for r in records:
        rd = str(r.get("reading_date", ""))
        if not rd or len(rd) < 7:
            continue
        ym = rd[:7]  # YYYY-MM
        if ym not in monthly:
            monthly[ym] = {"month": ym, "total_kwh": 0.0, "avg_mw_sum": 0.0, "count": 0, "total_revenue": 0.0}
        monthly[ym]["total_kwh"] += float(r.get("total_daily_units_kwh") or 0)
        monthly[ym]["avg_mw_sum"] += float(r.get("avg_station_load_mw") or 0)
        monthly[ym]["count"] += 1
        monthly[ym]["total_revenue"] += float(r.get("actual_revenue_pkr") or 0)

    if date_from and date_to:
        try:
            current_month = date.fromisoformat(date_from[:10]).replace(day=1)
            final_month = date.fromisoformat(date_to[:10]).replace(day=1)
            while current_month <= final_month:
                month_key = current_month.strftime("%Y-%m")
                monthly.setdefault(month_key, {
                    "month": month_key,
                    "total_kwh": 0.0,
                    "avg_mw_sum": 0.0,
                    "count": 0,
                    "total_revenue": 0.0
                })
                if current_month.month == 12:
                    current_month = date(current_month.year + 1, 1, 1)
                else:
                    current_month = date(current_month.year, current_month.month + 1, 1)
        except ValueError:
            pass

    return [
        {
            "month": v["month"],
            "total_kwh": round(v["total_kwh"], 2),
            "total_gwh": round(v["total_kwh"] / 1_000_000, 4),
            "avg_mw": round(v["avg_mw_sum"] / v["count"], 3) if v["count"] > 0 else 0,
            "total_revenue_pkr": round(v["total_revenue"], 2)
        }
        for v in sorted(monthly.values(), key=lambda x: x["month"])
    ]

async def get_powerhouse_performance() -> List[Dict[str, Any]]:
    """Returns per-powerhouse performance summary for fleet-wide view instantly from cache."""
    all_records = await _get_all_generation_records_cached()
    all_ph = await list_powerhouses()
    ph_name_map = {str(p.id): (p.name, float(p.installed_capacity_mw)) for p in all_ph}

    perf: Dict[str, Dict[str, Any]] = {}
    for r in all_records:
        pid = str(r.get("powerhouse_id", ""))
        if not pid:
            continue
        if pid not in perf:
            name, cap = ph_name_map.get(pid, ("Unknown", 0.0))
            perf[pid] = {
                "powerhouse_id": pid,
                "powerhouse_name": name,
                "installed_capacity_mw": cap,
                "avg_mw_sum": 0.0,
                "plant_factor_sum": 0.0,
                "count": 0,
                "outage_days": 0
            }
        perf[pid]["avg_mw_sum"] += float(r.get("avg_station_load_mw") or 0)
        perf[pid]["plant_factor_sum"] += float(r.get("daily_plant_factor_pct") or 0)
        perf[pid]["count"] += 1
        if r.get("outage_flag"):
            perf[pid]["outage_days"] += 1

    return [
        {
            "powerhouse_id": v["powerhouse_id"],
            "powerhouse_name": v["powerhouse_name"],
            "installed_capacity_mw": v["installed_capacity_mw"],
            "avg_generation_mw": round(v["avg_mw_sum"] / v["count"], 3) if v["count"] > 0 else 0,
            "avg_plant_factor_pct": round(v["plant_factor_sum"] / v["count"], 3) if v["count"] > 0 else 0,
            "outage_days": v["outage_days"],
            "total_records": v["count"]
        }
        for v in sorted(perf.values(), key=lambda x: x["powerhouse_name"])
    ]

async def get_inflow_vs_generation(
    powerhouse_id: Optional[Any] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Returns paired inflow vs generation data with 1 clean data point per date."""
    resolved_pid = await resolve_powerhouse_id(powerhouse_id)
    all_records = await _get_all_generation_records_cached()
    records = _filter_records(all_records, resolved_pid, date_from, date_to)

    if resolved_pid:
        records_sorted = sorted(records, key=lambda x: str(x.get("reading_date", "")))
        return [
            {
                "date": r["reading_date"],
                "avg_generation_mw": round(float(r.get("avg_station_load_mw") or 0), 2),
                "inflow_cumecs": round(float(r.get("actual_avg_inflow_cumecs") or 0), 2)
            }
            for r in records_sorted
            if r.get("actual_avg_inflow_cumecs") is not None
        ]
    else:
        # Fleet-wide: aggregate by date so each date has 1 clean point
        by_date: Dict[str, Dict[str, Any]] = {}
        for r in records:
            d = str(r.get("reading_date", ""))
            if not d:
                continue
            if d not in by_date:
                by_date[d] = {"mw_sum": 0.0, "mw_count": 0, "inflow_sum": 0.0, "inflow_count": 0}
            if r.get("avg_station_load_mw") is not None:
                by_date[d]["mw_sum"] += float(r["avg_station_load_mw"])
                by_date[d]["mw_count"] += 1
            if r.get("actual_avg_inflow_cumecs") is not None:
                by_date[d]["inflow_sum"] += float(r["actual_avg_inflow_cumecs"])
                by_date[d]["inflow_count"] += 1

        result = []
        for d in sorted(by_date.keys()):
            item = by_date[d]
            avg_mw = round(item["mw_sum"] / item["mw_count"], 2) if item["mw_count"] > 0 else 0.0
            avg_inflow = round(item["inflow_sum"] / item["inflow_count"], 2) if item["inflow_count"] > 0 else 0.0
            result.append({
                "date": d,
                "avg_generation_mw": avg_mw,
                "inflow_cumecs": avg_inflow
            })
        return result

async def get_efficiency_by_plant() -> List[Dict[str, Any]]:
    """Returns efficiency (avg plant factor %) per powerhouse for efficiency bar chart."""
    performance = await get_powerhouse_performance()
    return [
        {
            "powerhouse_name": p["powerhouse_name"],
            "powerhouse_id": p["powerhouse_id"],
            "avg_plant_factor_pct": p["avg_plant_factor_pct"],
            "installed_capacity_mw": p["installed_capacity_mw"]
        }
        for p in performance
    ]

async def get_dashboard_status(
    powerhouse_id: Optional[Any] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Returns per-powerhouse status table rows for operational status widget on dashboard."""
    resolved_pid = await resolve_powerhouse_id(powerhouse_id)
    all_records = await _get_all_generation_records_cached()
    records = _filter_records(all_records, resolved_pid, date_from, date_to)

    stats: Dict[str, Dict[str, float]] = {}
    for r in records:
        pid = str(r.get("powerhouse_id", ""))
        if not pid:
            continue
        if pid not in stats:
            stats[pid] = {"mw_sum": 0.0, "pf_sum": 0.0, "count": 0.0}
        stats[pid]["mw_sum"] += float(r.get("avg_station_load_mw") or 0)
        stats[pid]["pf_sum"] += float(r.get("daily_plant_factor_pct") or 0)
        stats[pid]["count"] += 1.0

    all_ph = await list_powerhouses()
    if resolved_pid:
        all_ph = [p for p in all_ph if str(p.id) == resolved_pid]

    status_as_of_date = STATUS_DATA_CUTOFF
    if date_to:
        try:
            status_as_of_date = min(date.fromisoformat(date_to[:10]), STATUS_DATA_CUTOFF)
        except ValueError:
            pass

    latest_positive_dates: Dict[str, date] = {}
    first_record_dates: Dict[str, date] = {}
    for record in all_records:
        pid = str(record.get("powerhouse_id", ""))
        reading_day = str(record.get("reading_date", ""))[:10]
        if not pid or not reading_day:
            continue
        try:
            record_date = date.fromisoformat(reading_day)
        except ValueError:
            continue
        if record_date > status_as_of_date:
            continue
        if record_date < first_record_dates.get(pid, date.max):
            first_record_dates[pid] = record_date
        generation = record.get("avg_station_load_mw")
        if generation is not None and float(generation) > 0:
            if record_date > latest_positive_dates.get(pid, date.min):
                latest_positive_dates[pid] = record_date

    today = date.today()
    result: List[Dict[str, Any]] = []
    for ph in all_ph:
        pid = str(ph.id)
        s = stats.get(pid, {"mw_sum": 0.0, "pf_sum": 0.0, "count": 0.0})
        cnt = s["count"]
        avg_gen = round(s["mw_sum"] / cnt, 2) if cnt > 0 else 0.0
        eff = round(s["pf_sum"] / cnt, 2) if cnt > 0 else 0.0
        master_status = (ph.status or "RUNNING").upper()
        fallback_status = "SHUTDOWN" if master_status == "SHUTDOWN" else "RUNNING"
        last_positive_date = latest_positive_dates.get(pid)
        if last_positive_date:
            days_without_positive_input = (status_as_of_date - last_positive_date).days
            status_str = "SHUTDOWN" if days_without_positive_input >= STATUS_STALE_DAYS else "RUNNING"
        elif pid in first_record_dates:
            days_without_positive_input = (status_as_of_date - first_record_dates[pid]).days
            status_str = "SHUTDOWN" if days_without_positive_input >= STATUS_STALE_DAYS else fallback_status
        else:
            status_str = fallback_status
        result.append({
            "plant": ph.name,
            "name": ph.name,
            "installed": float(ph.installed_capacity_mw),
            "installed_capacity_mw": float(ph.installed_capacity_mw),
            "avgGen": avg_gen,
            "avg_generation_mw": avg_gen,
            "efficiency": eff,
            "avg_plant_factor_pct": eff,
            "status": status_str
        })

    return result

async def get_inflow_generation_correlation(
    powerhouse_id: UUID,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
) -> Dict[str, Any]:
    """Computes Pearson correlation between actual inflow and avg station load instantly from cache."""
    all_records = await _get_all_generation_records_cached()
    records = _filter_records(all_records, powerhouse_id, date_from, date_to)
    records_sorted = sorted(records, key=lambda x: str(x.get("reading_date", "")))

    paired = [
        (float(r["actual_avg_inflow_cumecs"]), float(r["avg_station_load_mw"]))
        for r in records_sorted
        if r.get("actual_avg_inflow_cumecs") is not None and r.get("avg_station_load_mw") is not None
    ]

    if len(paired) < 2:
        return {
            "powerhouse_id": str(powerhouse_id),
            "date_range": {"from": date_from, "to": date_to},
            "correlation_coefficient": None,
            "data_points": len(paired),
            "trend_data": [],
            "message": "Insufficient data for correlation analysis (minimum 2 data points required)"
        }

    x_vals = [p[0] for p in paired]
    y_vals = [p[1] for p in paired]

    n = len(x_vals)
    x_mean = sum(x_vals) / n
    y_mean = sum(y_vals) / n

    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(x_vals, y_vals))
    x_std = (sum((x - x_mean) ** 2 for x in x_vals)) ** 0.5
    y_std = (sum((y - y_mean) ** 2 for y in y_vals)) ** 0.5
    denominator = x_std * y_std

    correlation = round(numerator / denominator, 4) if denominator != 0 else 0

    trend_data = [
        {"date": records_sorted[i]["reading_date"], "inflow_cumecs": paired[i][0], "avg_mw": paired[i][1]}
        for i in range(len(paired))
    ]

    return {
        "powerhouse_id": str(powerhouse_id),
        "date_range": {"from": date_from, "to": date_to},
        "correlation_coefficient": correlation,
        "data_points": n,
        "trend_data": trend_data
    }
