import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, Optional, Tuple

OUTAGE_KEYWORDS = [
    r"shutdown", r"outage", r"tripping", r"\btrip\b", r"maintenance", r"repair",
    r"replacement", r"fault", r"breakdown", r"tower", r"line", r"transmission",
    r"not operational", r"\bclosed\b", r"canal closure", r"annual closure",
    r"closure of canal", r"nil demand", r"off the bar", r"off bar", r"taken off",
    r"standby", r"desynchronized", r"desynchronised"
]

CANAL_CLOSURE_KEYWORDS = [
    r"canal closure", r"annual closure", r"closure of canal",
    r"closed by irrigation", r"upper swat canal", r"canal closed",
    r"notification of annual canal closure"
]

OUTAGE_REGEX = re.compile("|".join(OUTAGE_KEYWORDS), re.IGNORECASE)
CANAL_CLOSURE_REGEX = re.compile("|".join(CANAL_CLOSURE_KEYWORDS), re.IGNORECASE)

def detect_outage_flag(remarks: Optional[str]) -> bool:
    """Detects if remarks contain outage or shutdown indicators per Section 56.4."""
    if not remarks or not remarks.strip():
        return False
    return bool(OUTAGE_REGEX.search(remarks))

def detect_canal_closure_flag(remarks: Optional[str]) -> bool:
    """Detects if remarks contain canal closure indicators per Section 56.5."""
    if not remarks or not remarks.strip():
        return False
    return bool(CANAL_CLOSURE_REGEX.search(remarks))

def round_curr(val: Decimal, places: int = 2) -> Decimal:
    """Helper to round Decimals predictably."""
    return val.quantize(Decimal(10) ** -places, rounding=ROUND_HALF_UP)

def calculate_derived_generation_fields(
    avg_station_load_mw: Decimal,
    installed_capacity_mw: Decimal,
    tariff_rate: Decimal,
    avg_annual_design_plant_factor_pct: Decimal,
    aux_consumption_kwh: Optional[Decimal] = None,
    remarks: Optional[str] = None,
    total_daily_units_kwh: Optional[Decimal] = None,
    daily_net_energy_kwh: Optional[Decimal] = None,
    expected_generation_gwh: Optional[Decimal] = None,
    expected_revenue_pkr: Optional[Decimal] = None
) -> Dict[str, Any]:
    """
    Authoritative single-source calculation service per Section 56.3.
    Calculates derived operational and financial statistics from raw engineer inputs.
    """
    # A. Prefer the meter reading; retain the legacy MW-based estimate as fallback.
    total_daily_units_kwh = total_daily_units_kwh if total_daily_units_kwh is not None else (
        avg_station_load_mw * Decimal("24") * Decimal("1000")
    )
    if total_daily_units_kwh < 0:
        raise ValueError("Total daily units cannot be negative.")

    # B. Auxiliary Consumption (kWh)
    if aux_consumption_kwh is not None:
        final_aux_kwh = aux_consumption_kwh
        aux_source = "actual"
    elif daily_net_energy_kwh is not None:
        final_aux_kwh = total_daily_units_kwh - daily_net_energy_kwh
        aux_source = "derived"
    else:
        final_aux_kwh = total_daily_units_kwh * Decimal("0.01")
        aux_source = "estimated"

    # C. Prefer the entered net-meter reading; otherwise derive it from total and aux.
    daily_net_energy_kwh = daily_net_energy_kwh if daily_net_energy_kwh is not None else (
        total_daily_units_kwh - final_aux_kwh
    )
    if final_aux_kwh < 0 or daily_net_energy_kwh < 0 or daily_net_energy_kwh > total_daily_units_kwh:
        raise ValueError("Net energy and auxiliary consumption must fit within total daily units.")

    # D. Daily Plant Factor (%) = (total_daily_units_kwh / (capacity * 24 * 1000)) * 100
    if installed_capacity_mw > 0:
        denominator = installed_capacity_mw * Decimal("24") * Decimal("1000")
        daily_plant_factor_pct = (total_daily_units_kwh / denominator) * Decimal("100")
    else:
        daily_plant_factor_pct = Decimal("0")

    # E. Expected Generation (GWh) = capacity * 24 * (design_pf / 100) / 1000
    expected_generation_gwh = expected_generation_gwh if expected_generation_gwh is not None else (
        installed_capacity_mw * Decimal("24") * (avg_annual_design_plant_factor_pct / Decimal("100"))
    ) / Decimal("1000")

    # F. Expected Revenue (PKR) = expected_generation_gwh * 1,000,000 * tariff_rate
    expected_revenue_pkr = expected_revenue_pkr if expected_revenue_pkr is not None else (
        expected_generation_gwh * Decimal("1000000") * tariff_rate
    )

    # G. Actual Revenue (PKR) = daily_net_energy_kwh * tariff_rate
    actual_revenue_pkr = daily_net_energy_kwh * tariff_rate

    # H. Revenue Difference (PKR) = expected_revenue_pkr - actual_revenue_pkr
    revenue_difference_pkr = expected_revenue_pkr - actual_revenue_pkr

    # Flags
    outage_flag = detect_outage_flag(remarks)
    canal_closure_flag = detect_canal_closure_flag(remarks)

    return {
        "total_daily_units_kwh": round_curr(total_daily_units_kwh, 2),
        "aux_consumption_kwh": round_curr(final_aux_kwh, 2),
        "aux_consumption_source": aux_source,
        "daily_net_energy_kwh": round_curr(daily_net_energy_kwh, 2),
        "daily_plant_factor_pct": round_curr(daily_plant_factor_pct, 3),
        "expected_generation_gwh": round_curr(expected_generation_gwh, 4),
        "expected_revenue_pkr": round_curr(expected_revenue_pkr, 2),
        "actual_revenue_pkr": round_curr(actual_revenue_pkr, 2),
        "revenue_difference_pkr": round_curr(revenue_difference_pkr, 2),
        "outage_flag": outage_flag,
        "canal_closure_flag": canal_closure_flag,
        "tariff_rate": round_curr(tariff_rate, 4),
        "avg_annual_design_plant_factor_pct": round_curr(avg_annual_design_plant_factor_pct, 3)
    }
