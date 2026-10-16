"""Quote audit: Gemini reads the bill (and quote), plain Python does the maths.

Run `python audit.py <bill-image> <quote-image>` to test the full audit.

Gemini only extracts what is printed. Every number we show is computed here,
so it can be explained and checked.
"""
import hashlib
import json
import time
from datetime import date
from typing import Optional

import numpy as np
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from config import (EXPORT_RATE_RS_PER_UNIT, GEMINI_API_KEY, GEMINI_CACHE, GEMINI_MODEL, MAX_ADVANCE_PCT,
                    MIN_WORKMANSHIP_YEARS, OVERSIZE_FACTOR, PRICE_PER_KW_HIGH, PRICE_PER_KW_LOW,
                    TARIFF_RS_PER_UNIT, UNDERSIZE_FACTOR)

# Tried in order when the main model is busy (503) or unreachable
FALLBACK_MODELS = ["gemini-flash-latest", "gemini-3-flash-preview", "gemini-flash-lite-latest"]

# --- Gemini extraction ------------------------------------------------------


class HistoryEntry(BaseModel):
    period: str = Field(description="Billing period or month label as printed")
    units: float


class BillExtract(BaseModel):
    discom: Optional[str] = Field(None, description="Electricity board, e.g. KSEB")
    tariff: Optional[str] = Field(None, description="Tariff code as printed, e.g. LT-1A Dom")
    purpose: Optional[str] = Field(None, description="e.g. Domestic")
    connected_load_kw: Optional[float] = Field(None, description="Connected load in kW")
    phase: Optional[int] = None
    bill_date: Optional[str] = Field(None, description="YYYY-MM-DD")
    previous_reading_date: Optional[str] = Field(None, description="YYYY-MM-DD")
    current_reading_date: Optional[str] = Field(None, description="YYYY-MM-DD")
    previous_reading: Optional[float] = None
    current_reading: Optional[float] = None
    units_consumed: Optional[float] = Field(None, description="Consumption (Cons) for this bill, kWh")
    average_units: Optional[float] = Field(None, description="Average (Avg) consumption if printed")
    energy_charges: Optional[float] = None
    bill_amount: Optional[float] = Field(None, description="Bill Amount before adjustments")
    consumption_history: list[HistoryEntry] = Field(
        default_factory=list, description="Past consumption per period, only if printed on the bill")
    unclear_fields: list[str] = Field(
        default_factory=list, description="Names of fields that were hard to read or guessed")


BILL_PROMPT = """You are reading a photo of an Indian electricity bill (usually a KSEB spot bill from Kerala).
Extract only what is printed. Do not guess or calculate missing values: use null.
Dates as YYYY-MM-DD (bills print DD/MM/YYYY).
'Cons' is units consumed this bill, 'Curr'/'Prev' are meter readings, 'Avg' is average consumption.
Do NOT extract names, consumer numbers, bill numbers, addresses or meter reader names.
List any field you could not read clearly in unclear_fields."""


def _client():
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY missing in .env")
    return genai.Client(api_key=GEMINI_API_KEY)


def gemini_extract(image: bytes, mime_type: str, prompt: str, schema: type[BaseModel], kind: str):
    """Structured extraction, cached by image hash so the demo works offline."""
    key = hashlib.sha256(image).hexdigest()[:16]
    cache_file = GEMINI_CACHE / f"{kind}_{key}.json"
    if cache_file.exists():
        return schema.model_validate_json(cache_file.read_text())

    client = _client()
    response, last_error = None, None
    for model in [GEMINI_MODEL] + [m for m in FALLBACK_MODELS if m != GEMINI_MODEL]:
        for attempt in range(2):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=[types.Part.from_bytes(data=image, mime_type=mime_type), prompt],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=schema,
                        temperature=0,
                    ),
                )
                break
            except Exception as e:      # dropped connections, 503 "high demand", retired models
                last_error = e
                if str(getattr(e, "code", "")) in ("400", "401", "403"):
                    raise               # bad key or request: retrying won't help
                time.sleep(2 * (attempt + 1))
        if response is not None:
            break
    if response is None:
        raise RuntimeError(f"Gemini unavailable: {last_error}")
    result = schema.model_validate_json(response.text)
    GEMINI_CACHE.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(result.model_dump_json(indent=2))
    return result


# --- Bill analysis (plain Python) -------------------------------------------

def _parse_date(s):
    try:
        return date.fromisoformat(s) if s else None
    except ValueError:
        return None


def analyse_bill(b: BillExtract):
    warnings = [f"Could not read clearly: {f}" for f in b.unclear_fields]

    # Units: trust the meter readings when they agree with 'Cons'
    units = b.units_consumed
    if b.current_reading is not None and b.previous_reading is not None:
        from_readings = b.current_reading - b.previous_reading
        if units is None:
            units = from_readings
        elif abs(from_readings - units) > 1:
            warnings.append(f"Units printed ({units:g}) differ from meter readings ({from_readings:g})")

    # Billing period length (KSEB domestic is bi-monthly)
    start, end = _parse_date(b.previous_reading_date), _parse_date(b.current_reading_date)
    if start and end and end > start:
        days = (end - start).days
    else:
        days = 61
        warnings.append("Billing period dates missing, assumed 2 months")

    # Yearly usage: printed history if there is enough, else scale this bill
    if len(b.consumption_history) >= 3:
        history_units = [h.units for h in b.consumption_history]
        monthly = sum(history_units) / len(history_units) / (days / 30.4)
        basis = f"average of {len(history_units)} past bills printed on the bill"
    elif units:
        monthly = units / days * 30.4
        basis = f"this bill only ({units:g} units over {days} days), scaled to a year"
        warnings.append("Only one billing period visible. Usage varies by season, so check the yearly estimate")
    else:
        monthly = None
        basis = "could not read consumption"

    tariff_ok = bool(b.tariff and ("1A" in b.tariff.upper() or "DOM" in b.tariff.upper()))
    if b.tariff and not tariff_ok:
        warnings.append(f"Tariff {b.tariff} is not domestic LT-1A; savings estimate may be off")

    return {
        "units_this_bill": units,
        "billing_days": days,
        "monthly_units": round(monthly) if monthly else None,
        "yearly_units": round(monthly * 12) if monthly else None,
        "yearly_basis": basis,
        "connected_load_kw": b.connected_load_kw,
        "tariff": b.tariff,
        "domestic": tariff_ok,
        "average_rate_rs": round(b.energy_charges / units, 2) if b.energy_charges and units else None,
        "warnings": warnings,
    }


def read_bill(image: bytes, mime_type: str = "image/jpeg"):
    extract = gemini_extract(image, mime_type, BILL_PROMPT, BillExtract, "bill")
    return {"extracted": extract.model_dump(), "analysis": analyse_bill(extract)}


# --- Quote extraction -------------------------------------------------------


class LineItem(BaseModel):
    item: str
    amount: Optional[float] = None


class QuoteExtract(BaseModel):
    installer_name: Optional[str] = None
    quote_date: Optional[str] = Field(None, description="YYYY-MM-DD")
    system_kw: Optional[float] = Field(None, description="System size as advertised, kW")
    panel_count: Optional[int] = None
    panel_watt: Optional[float] = Field(None, description="Watt-peak of one panel")
    panel_type: Optional[str] = None
    inverter_kw: Optional[float] = None
    inverter_type: Optional[str] = None
    total_price: Optional[float] = Field(None, description="Final total payable, rupees")
    price_includes_gst: Optional[bool] = None
    line_items: list[LineItem] = Field(default_factory=list)
    claimed_units_per_month: Optional[float] = Field(
        None, description="Generation promised per month; if only per day is given, multiply by 30")
    claimed_payback_years: Optional[float] = None
    claims_zero_bill: Optional[bool] = Field(None, description="Does it promise a zero / no electricity bill?")
    panel_product_warranty_years: Optional[float] = None
    panel_performance_warranty_years: Optional[float] = None
    inverter_warranty_years: Optional[float] = None
    workmanship_warranty_years: Optional[float] = None
    advance_payment_pct: Optional[float] = Field(None, description="Percent paid before installation")
    net_metering_included: Optional[bool] = None
    unclear_fields: list[str] = Field(default_factory=list)


QUOTE_PROMPT = """You are reading an installer's quotation for a rooftop solar system in India.
Extract only what is printed. Use null for anything not stated. Amounts in rupees as plain numbers
(Indian format 3,40,000 = 340000). Do NOT extract customer names, phone numbers or addresses.
List any field you could not read clearly in unclear_fields."""


def read_quote(image: bytes, mime_type: str = "image/jpeg"):
    return gemini_extract(image, mime_type, QUOTE_PROMPT, QuoteExtract, "quote").model_dump()


# --- Verdict (plain Python) -------------------------------------------------


def yield_per_kw(location):
    """kWh one kW produces in a year at this location, from real satellite sunlight."""
    from config import PERFORMANCE_RATIO
    from db import query_df
    sun = query_df("SELECT SUM(sunlight_kwh_m2) AS s FROM weather WHERE location = %s", [location]).iloc[0, 0]
    if sun is None:
        raise ValueError(f"No weather data for {location}")
    return float(sun) * PERFORMANCE_RATIO


def _savings(kw, yearly_units, yld):
    generated = kw * yld
    self_used = min(generated, yearly_units)
    exported = max(0.0, generated - yearly_units)
    rupees = self_used * TARIFF_RS_PER_UNIT + exported * EXPORT_RATE_RS_PER_UNIT
    return {"kw": round(kw, 2), "yearly_generation": round(generated), "self_used": round(self_used),
            "exported": round(exported), "yearly_savings": round(rupees)}


def _payback(cost, savings):
    """Range: ±7% for good and bad sunlight years."""
    if not savings:
        return None
    return [round(cost / (savings * 1.07), 1), round(cost / (savings * 0.93), 1)]


def lakh(x):
    return f"₹{x / 100000:.2f} lakh" if abs(x) >= 100000 else f"₹{x:,.0f}"


def verdict(quote: dict, yearly_units: float, location: str = "Kochi", connected_load_kw: float | None = None):
    q = QuoteExtract.model_validate(quote)
    yld = yield_per_kw(location)
    flags = []

    def flag(severity, title, detail):
        flags.append({"severity": severity, "title": title, "detail": detail})

    # Size actually installed (panels), and what usage needs
    dc_kw = q.panel_count * q.panel_watt / 1000 if q.panel_count and q.panel_watt else q.system_kw
    quoted_kw = dc_kw or 0
    shown_kw = f"{q.system_kw:g} kW" if q.system_kw else f"{quoted_kw:g} kW"     # size as the customer saw it
    needed_kw = yearly_units / yld
    recommended_kw = max(1.0, np.ceil(needed_kw * 2) / 2)          # round up to 0.5 kW

    quoted = _savings(quoted_kw, yearly_units, yld)
    recommended = _savings(recommended_kw, yearly_units, yld)
    price = q.total_price or 0
    price_per_kw = price / quoted_kw if quoted_kw else None
    fair_cost = [recommended_kw * PRICE_PER_KW_LOW, recommended_kw * PRICE_PER_KW_HIGH]
    quoted["advertised_kw"] = q.system_kw
    quoted["price"] = price
    quoted["price_per_kw"] = round(price_per_kw) if price_per_kw else None
    quoted["payback_years"] = _payback(price, quoted["yearly_savings"])
    recommended["cost_range"] = [round(c) for c in fair_cost]
    recommended["payback_years"] = [_payback(fair_cost[0], recommended["yearly_savings"])[0],
                                    _payback(fair_cost[1], recommended["yearly_savings"])[1]]

    # Size
    if quoted_kw > recommended_kw * OVERSIZE_FACTOR:
        label = "oversized"
        flag("high", "System is oversized",
             f"Your usage of {yearly_units:,.0f} units a year needs about {recommended_kw:g} kW. "
             f"The quote is {shown_kw} ({quoted_kw:g} kWp of panels). {quoted['exported']:,} units a year would be exported "
             f"to KSEB at about ₹{EXPORT_RATE_RS_PER_UNIT:g}/unit instead of saving you ₹{TARIFF_RS_PER_UNIT:g}/unit.")
    elif quoted_kw < recommended_kw * UNDERSIZE_FACTOR:
        label = "undersized"
        flag("medium", "System is smaller than your usage",
             f"{quoted_kw:g} kW covers about {quoted['yearly_generation'] / yearly_units:.0%} of your yearly usage.")
    else:
        label = "fair"

    # Price
    if price_per_kw and price_per_kw > PRICE_PER_KW_HIGH:
        if label == "fair":
            label = "overpriced"
        flag("high" if price_per_kw > PRICE_PER_KW_HIGH * 1.15 else "medium", "Price is above market",
             f"₹{price_per_kw:,.0f} per kW. Kerala rooftop systems typically cost "
             f"₹{PRICE_PER_KW_LOW:,}–{PRICE_PER_KW_HIGH:,} per kW installed.")
    elif price_per_kw and price_per_kw < PRICE_PER_KW_LOW * 0.85:
        flag("medium", "Price is unusually low",
             f"₹{price_per_kw:,.0f} per kW. Check panel brand, inverter brand and structure quality.")

    # Connected load
    if connected_load_kw and quoted_kw > connected_load_kw:
        flag("medium", "Bigger than your connected load",
             f"Your bill shows a {connected_load_kw:g} kW connected load. KSEB generally limits rooftop solar "
             f"to the connected load, so {quoted_kw:g} kW may need a load enhancement (extra fees and delay).")

    # Size labelling
    if q.system_kw and dc_kw and abs(dc_kw - q.system_kw) >= 0.2:
        flag("info", "Advertised size differs from panels",
             f"Quote says {q.system_kw:g} kW but {q.panel_count} × {q.panel_watt:g} Wp = {dc_kw:g} kWp of panels.")

    # Inverter sizing
    if q.inverter_kw and dc_kw:
        ratio = dc_kw / q.inverter_kw
        if ratio > 1.3:
            flag("medium", "Inverter may be too small",
                 f"{dc_kw:g} kWp of panels on a {q.inverter_kw:g} kW inverter (ratio {ratio:.2f}) will clip output on sunny days.")
        elif ratio < 0.8:
            flag("info", "Inverter larger than needed", f"Ratio {ratio:.2f}; a smaller inverter would cost less.")

    # Claims
    realistic_month = quoted["yearly_generation"] / 12
    if q.claimed_units_per_month and q.claimed_units_per_month > realistic_month * 1.1:
        flag("medium", "Generation claim is too high",
             f"Quote promises {q.claimed_units_per_month:,.0f} units/month. For {quoted_kw:g} kW in {location}, "
             f"satellite data says about {realistic_month:,.0f} units/month on average.")
    if q.claimed_payback_years and quoted["payback_years"] and q.claimed_payback_years < quoted["payback_years"][0] * 0.8:
        flag("medium", "Payback claim is optimistic",
             f"Quote claims {q.claimed_payback_years:g} years. With your usage it is about "
             f"{quoted['payback_years'][0]:g}–{quoted['payback_years'][1]:g} years.")
    if q.claims_zero_bill:
        flag("info", "'Zero bill' is not realistic",
             "KSEB fixed charges, meter rent and duty remain even if solar covers all your units.")

    # Terms
    if q.workmanship_warranty_years is None:
        flag("medium", "No workmanship warranty stated", "Ask for at least 5 years in writing.")
    elif q.workmanship_warranty_years < MIN_WORKMANSHIP_YEARS:
        flag("medium", "Short workmanship warranty",
             f"Only {q.workmanship_warranty_years:g} years. Installation faults (loose connectors, failed strings) "
             f"often show up later; {MIN_WORKMANSHIP_YEARS} years is common.")
    if q.panel_performance_warranty_years and q.panel_performance_warranty_years < 25:
        flag("medium", "Short panel performance warranty", f"{q.panel_performance_warranty_years:g} years; 25 is standard.")
    if q.advance_payment_pct and q.advance_payment_pct > MAX_ADVANCE_PCT:
        flag("medium", "High advance payment",
             f"{q.advance_payment_pct:g}% before installation. Prefer milestone payments, with the last part after net-metering.")

    overpay = price - fair_cost[1] if label in ("oversized", "overpriced") else 0
    headline = {
        "oversized": f"Quoted {shown_kw}. Your usage needs about {recommended_kw:g} kW. "
                     f"A right-sized system should cost {lakh(fair_cost[0])}–{lakh(fair_cost[1])}, "
                     f"about {lakh(overpay)} less than this quote.",
        "overpriced": f"The size is right, but you are paying {lakh(overpay)} more than the market rate.",
        "undersized": f"This system covers only part of your usage. Consider {recommended_kw:g} kW.",
        "fair": f"Size and price look fair for your usage of {yearly_units:,.0f} units a year.",
    }[label]

    questions = {
        "System is oversized": f"Why {shown_kw} when my usage needs about {recommended_kw:g} kW? Please quote {recommended_kw:g} kW.",
        "Price is above market": "Can you give a line-by-line price for panels, inverter and structure brands?",
        "Bigger than your connected load": "Who handles the KSEB load enhancement, and what does it cost?",
        "Generation claim is too high": "What monthly generation will you guarantee in writing?",
        "Short workmanship warranty": f"Can you extend the workmanship warranty to {MIN_WORKMANSHIP_YEARS} years?",
        "No workmanship warranty stated": "What is the workmanship warranty, in writing?",
        "High advance payment": "Can the payment be split into milestones, with the final part after net-metering?",
        "Inverter may be too small": "Why is the inverter smaller than the panel capacity?",
    }
    order = {"high": 0, "medium": 1, "info": 2}
    flags.sort(key=lambda f: order[f["severity"]])

    return {
        "verdict": label,
        "headline": headline,
        "overpay_rs": round(max(0, overpay)),
        "inputs": {
            "yearly_units": yearly_units, "location": location, "connected_load_kw": connected_load_kw,
            "yield_kwh_per_kw": round(yld), "tariff_rs": TARIFF_RS_PER_UNIT,
            "export_rate_rs": EXPORT_RATE_RS_PER_UNIT,
        },
        "quoted": quoted,
        "recommended": recommended,
        "flags": flags,
        "questions": [questions[f["title"]] for f in flags if f["title"] in questions],
    }


def save_audit(bill, quote, result):
    from db import get_conn
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO audits (bill_json, quote_json, verdict) VALUES (%s, %s, %s) RETURNING id",
                    (json.dumps(bill), json.dumps(quote), json.dumps(result)))
        return cur.fetchone()[0]


if __name__ == "__main__":
    import sys
    from pathlib import Path

    sys.stdout.reconfigure(encoding="utf-8")
    bill_path, quote_path = sys.argv[1], sys.argv[2]
    bill = read_bill(Path(bill_path).read_bytes())
    quote = read_quote(Path(quote_path).read_bytes(), "image/png" if quote_path.endswith(".png") else "image/jpeg")
    print("QUOTE:", json.dumps(quote, indent=2, ensure_ascii=False))
    result = verdict(quote, bill["analysis"]["yearly_units"], "Kochi", bill["analysis"]["connected_load_kw"])
    print("\nVERDICT:", json.dumps(result, indent=2, ensure_ascii=False))
