"""Homeowner view of one system: status, money, warranty, alerts.

"Today" is the system's latest reading (the simulated fleet ends on 31 Dec 2025).
"""
import pandas as pd

from config import TARIFF_RS_PER_UNIT
from db import query_df
from predict import get_alerts

STATUS = {
    "technician": ("needs_technician", "Needs a technician"),
    "homeowner": ("clean_panels", "Clean your panels"),
    "weather": ("weather", "Low output because of weather, no action needed"),
    "ok": ("ok", "Working well"),
}


def system_summary(system_id):
    sys = query_df("""
        SELECT id, name, owner_name, location, capacity_kw, install_date, warranty_until, source, baseline
        FROM systems WHERE id = %s
    """, [system_id])
    if sys.empty:
        return None
    s = sys.iloc[0]

    last = query_df("""
        SELECT time::date AS day, rolling_7, label FROM health
        WHERE system_id = %s ORDER BY time DESC LIMIT 1
    """, [system_id])
    if last.empty:
        return None
    today = last.iloc[0]

    totals = query_df("""
        SELECT SUM(actual_kwh)   FILTER (WHERE time > %(last)s::date - 30) AS month_actual,
               SUM(expected_kwh) FILTER (WHERE time > %(last)s::date - 30) AS month_expected,
               SUM(actual_kwh)                                            AS total_actual,
               MIN(time)::date                                            AS first_day,
               COUNT(*) FILTER (WHERE label = 'weather_dip' AND ratio < 0.85) AS weather_low_days
        FROM health WHERE system_id = %(sid)s
    """, {"sid": system_id, "last": today["day"]}).iloc[0]

    alerts = get_alerts(system_id)
    open_alerts = alerts[alerts["status"] == "open"]
    tech = open_alerts[open_alerts["audience"] == "technician"]
    home = open_alerts[open_alerts["audience"] == "homeowner"]
    if not tech.empty:
        key, top = "technician", tech.iloc[0]
    elif not home.empty:
        key, top = "homeowner", home.iloc[0]
    else:
        key, top = ("weather" if today["label"] == "weather_dip" else "ok"), None
    status, status_text = STATUS[key]

    warranty = s["warranty_until"]
    return {
        "system": {
            "id": int(s["id"]), "name": s["name"], "owner_name": s["owner_name"], "location": s["location"],
            "capacity_kw": float(s["capacity_kw"]), "install_date": str(s["install_date"]),
            "warranty_until": str(warranty) if warranty else None, "source": s["source"],
        },
        "as_of": str(today["day"]),
        "first_day": str(totals["first_day"]),
        "status": status,
        "status_text": status_text,
        "health_pct": round(float(today["rolling_7"]) * 100) if today["rolling_7"] is not None else None,
        "month": {
            "generated_kwh": round(float(totals["month_actual"] or 0)),
            "expected_kwh": round(float(totals["month_expected"] or 0)),
            "saved_rs": round(float(totals["month_actual"] or 0) * TARIFF_RS_PER_UNIT),
            "lost_rs": round(float(top["rupees_per_month"])) if top is not None else 0,
        },
        "total": {
            "generated_kwh": round(float(totals["total_actual"] or 0)),
            "saved_rs": round(float(totals["total_actual"] or 0) * TARIFF_RS_PER_UNIT),
        },
        "warranty_days_left": (warranty - today["day"]).days if warranty else None,
        "weather_low_days": int(totals["weather_low_days"] or 0),
        "tariff_rs": TARIFF_RS_PER_UNIT,
    }


# --- Monthly report -----------------------------------------------------------

FAULT_NAMES = {"string_failure": "a panel string offline", "inverter_off": "the inverter not producing",
               "soiling": "dust on the panels"}


def report_months(system_id):
    """Calendar months with data, newest first (TimescaleDB monthly buckets in IST)."""
    df = query_df("""
        SELECT time_bucket('1 month', time, 'Asia/Kolkata')::date AS month, COUNT(*) AS days
        FROM health WHERE system_id = %s GROUP BY 1 ORDER BY 1 DESC
    """, [system_id])
    return [m.strftime("%Y-%m") for m in df["month"]]


def monthly_report(system_id, month=None):
    months = report_months(system_id)
    if not months:
        return None
    month = month if month in months else months[0]
    start = pd.Timestamp(f"{month}-01")
    end = start + pd.offsets.MonthBegin(1)
    prev = (start - pd.offsets.MonthBegin(1)).strftime("%Y-%m")

    days = query_df("""
        SELECT h.time::date AS day, h.actual_kwh, h.expected_kwh, h.ratio, h.label, w.rain_mm
        FROM health h JOIN systems s ON s.id = h.system_id
        LEFT JOIN weather w ON w.location = s.location AND w.time = h.time
        WHERE h.system_id = %s AND h.time >= %s AND h.time < %s ORDER BY h.time
    """, [system_id, start.date(), end.date()])
    days["day"] = pd.to_datetime(days["day"])

    alerts = get_alerts(system_id)
    alerts = alerts[(pd.to_datetime(alerts["start_date"]) < end)
                    & (alerts["end_date"].isna() | (pd.to_datetime(alerts["end_date"]) >= start))]

    # Units lost: shortfall on days a confirmed problem was active
    in_fault = pd.Series(False, index=days.index)
    for a in alerts.itertuples():
        a_end = pd.Timestamp(a.end_date) if a.end_date else end
        in_fault |= (days["day"] >= pd.Timestamp(a.start_date)) & (days["day"] <= a_end)
    lost_kwh = float((days["expected_kwh"] - days["actual_kwh"]).clip(lower=0)[in_fault].sum())

    made, expected = float(days["actual_kwh"].sum()), float(days["expected_kwh"].sum())
    perf = made / expected if expected else None
    prev_made = query_df("""
        SELECT SUM(actual_kwh) FROM health
        WHERE system_id = %s AND time >= %s AND time < %s
    """, [system_id, (start - pd.offsets.MonthBegin(1)).date(), start.date()]).iloc[0, 0]

    rain_mm = float(days["rain_mm"].fillna(0).sum())
    best = days.loc[days["actual_kwh"].idxmax()]
    sys = query_df("SELECT owner_name, name, location, capacity_kw, warranty_until FROM systems WHERE id = %s",
                   [system_id]).iloc[0]
    label = start.strftime("%B %Y")

    tech = alerts[alerts["audience"] == "technician"]
    if not tech.empty:
        a = tech.iloc[0]
        fixed = f", fixed on {pd.Timestamp(a['end_date']):%d %b}" if a["end_date"] else ", still not fixed"
        headline = (f"A problem cost you about ₹{lost_kwh * TARIFF_RS_PER_UNIT:,.0f} this month: "
                    f"{FAULT_NAMES[a['label']]} since {pd.Timestamp(a['start_date']):%d %b %Y}{fixed}.")
        status = "problem"
    elif not alerts.empty:
        headline = f"Dust cost you about ₹{lost_kwh * TARIFF_RS_PER_UNIT:,.0f} this month. Cleaning the panels brings it back."
        status = "dust"
    elif perf is not None and perf >= 0.9:
        headline = "Your system worked well all month."
        if rain_mm > 300:
            headline += " A rainy month means less sunlight, but your panels made the most of what there was."
        status = "good"
    else:
        headline = "Output was a little below what the sun allowed, but not long enough to point to a fault."
        status = "watch"

    return {
        "month": month, "label": label, "months": months,
        "system": {"id": system_id, "name": sys["owner_name"] or sys["name"], "location": sys["location"],
                   "capacity_kw": float(sys["capacity_kw"]),
                   "warranty_until": str(sys["warranty_until"]) if sys["warranty_until"] else None},
        "status": status,
        "headline": headline,
        "made_kwh": round(made),
        "expected_kwh": round(expected),
        "performance_pct": round(perf * 100) if perf else None,
        "saved_rs": round(made * TARIFF_RS_PER_UNIT),
        "lost_kwh": round(lost_kwh),
        "lost_rs": round(lost_kwh * TARIFF_RS_PER_UNIT),
        "previous": {"month": prev, "made_kwh": round(float(prev_made)) if prev_made else None},
        "weather": {
            "rain_mm": round(rain_mm),
            "rainy_days": int((days["rain_mm"] >= 10).sum()),
            "weather_low_days": int(((days["label"] == "weather_dip") & (days["ratio"] < 0.85)).sum()),
        },
        "best_day": {"day": str(best["day"].date()), "kwh": round(float(best["actual_kwh"]), 1)},
        "days": [
            {"day": str(d.day.date()), "made": round(d.actual_kwh, 2), "expected": round(d.expected_kwh, 2),
             "rain_mm": None if pd.isna(d.rain_mm) else round(d.rain_mm, 1), "problem": bool(f)}
            for d, f in zip(days.itertuples(), in_fault)
        ],
        "alerts": [
            {"label": a.label, "start_date": a.start_date, "end_date": a.end_date, "status": a.status}
            for a in alerts.itertuples()
        ],
        "tariff_rs": TARIFF_RS_PER_UNIT,
    }
