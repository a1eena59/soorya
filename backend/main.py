from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import numpy as np

from audit import read_bill, read_quote, save_audit, verdict
from config import ROOT
from db import db_status, query_df
from expected import get_health
from predict import get_alerts
from train import load_metrics
from weather import get_weather, summary

app = FastAPI(title="Soorya API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    try:
        return {"api": "ok", "db": "ok", **db_status()}
    except Exception as e:
        return {"api": "ok", "db": "error", "detail": str(e)}


@app.get("/api/weather")
def weather_summary():
    return summary().to_dict(orient="records")


@app.get("/api/weather/{location}")
def weather_for(location: str, start: str | None = None, end: str | None = None):
    df = get_weather(location, start, end)
    df["day"] = df["day"].astype(str)
    return df.to_dict(orient="records")


@app.get("/api/systems")
def list_systems():
    df = query_df("""
        SELECT s.id, s.name, s.owner_name, s.location, s.capacity_kw,
               s.install_date::text, s.warranty_until::text, i.name AS installer
        FROM systems s LEFT JOIN installers i ON i.id = s.installer_id
        ORDER BY s.id
    """)
    return df.to_dict(orient="records")


@app.get("/api/systems/{system_id}/readings")
def system_readings(system_id: int, start: str | None = None, end: str | None = None):
    sql = """
        SELECT r.time::date::text AS day, r.kwh, w.sunlight_kwh_m2, w.rain_mm
        FROM readings r
        JOIN systems s ON s.id = r.system_id
        LEFT JOIN weather w ON w.location = s.location AND w.time = r.time
        WHERE r.system_id = %s
    """
    params = [system_id]
    if start:
        sql += " AND r.time >= %s"
        params.append(start)
    if end:
        sql += " AND r.time <= %s"
        params.append(end)
    df = query_df(sql + " ORDER BY r.time", params)
    if df.empty:
        raise HTTPException(404, "No readings for this system")
    return df.to_dict(orient="records")


def records(df):
    """DataFrame -> JSON-safe list (NaN -> null)."""
    return df.astype(object).replace({np.nan: None}).to_dict(orient="records")


@app.get("/api/systems/{system_id}/health")
def system_health(system_id: int, start: str | None = None, end: str | None = None):
    df = get_health(system_id, start, end)
    if df.empty:
        raise HTTPException(404, "No health data for this system")
    return records(df)


@app.get("/api/systems/{system_id}/alerts")
def system_alerts(system_id: int):
    return records(get_alerts(system_id))


@app.get("/api/alerts")
def all_alerts(status: str | None = None, audience: str | None = None):
    df = get_alerts(status=status)
    if audience:
        df = df[df["audience"] == audience]
    return records(df)


@app.get("/api/fleet")
def fleet():
    """Every system's latest state, worst first."""
    df = query_df("""
        SELECT s.id, s.name, s.owner_name, s.location, s.capacity_kw, s.warranty_until::text,
               h.time::date::text AS last_day, h.rolling_7 AS health, h.label AS today_label,
               a.label AS alert_label, a.audience, a.action, a.start_date::text AS alert_since,
               a.fault_pct, a.rupees_per_month, a.confidence
        FROM systems s
        JOIN LATERAL (SELECT * FROM health WHERE system_id = s.id ORDER BY time DESC LIMIT 1) h ON TRUE
        LEFT JOIN LATERAL (SELECT * FROM alerts WHERE system_id = s.id AND status = 'open'
                           ORDER BY (audience = 'technician') DESC, rupees_per_month DESC LIMIT 1) a ON TRUE
        ORDER BY (a.audience = 'technician') DESC NULLS LAST, a.rupees_per_month DESC NULLS LAST, h.rolling_7
    """)
    return {
        "total": len(df),
        "need_technician": int((df["audience"] == "technician").sum()),
        "need_cleaning": int((df["audience"] == "homeowner").sum()),
        "rupees_lost_per_month": float(df["rupees_per_month"].fillna(0).sum()),
        "systems": records(df),
    }


@app.get("/api/model/stats")
def model_stats():
    return load_metrics()


ALLOWED_IMAGES = {"image/jpeg", "image/png", "image/webp", "application/pdf"}


@app.post("/api/audit/bill")
async def audit_bill(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_IMAGES:
        raise HTTPException(400, f"Upload a photo or PDF of the bill (got {file.content_type})")
    try:
        return read_bill(await file.read(), file.content_type)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@app.post("/api/audit/quote")
async def audit_quote(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_IMAGES:
        raise HTTPException(400, f"Upload a photo or PDF of the quote (got {file.content_type})")
    try:
        return read_quote(await file.read(), file.content_type)
    except RuntimeError as e:
        raise HTTPException(503, str(e))


class VerdictRequest(BaseModel):
    quote: dict                      # from /api/audit/quote, possibly edited by the user
    yearly_units: float              # from /api/audit/bill, possibly edited by the user
    location: str = "Kochi"
    connected_load_kw: float | None = None
    bill: dict | None = None         # stored with the audit, optional
    save: bool = True                # False while the user is editing numbers


@app.post("/api/audit/verdict")
def audit_verdict(req: VerdictRequest):
    """Pure maths, no Gemini: call again whenever the user edits a number."""
    try:
        result = verdict(req.quote, req.yearly_units, req.location, req.connected_load_kw)
    except ValueError as e:
        raise HTTPException(400, str(e))
    result["audit_id"] = save_audit(req.bill, req.quote, result) if req.save else None
    return result


DEMO_BILL = ROOT / "data" / "samples" / "sample.jpeg"
DEMO_QUOTE = ROOT / "data" / "samples" / "quote_sample.png"


@app.get("/api/audit/demo")
def audit_demo():
    """Sample bill + quote for the demo (served from the Gemini cache, works offline)."""
    if not DEMO_BILL.exists() or not DEMO_QUOTE.exists():
        raise HTTPException(404, "Demo samples missing in data/samples")
    return {
        "bill": read_bill(DEMO_BILL.read_bytes(), "image/jpeg"),
        "quote": read_quote(DEMO_QUOTE.read_bytes(), "image/png"),
    }


@app.get("/api/locations")
def locations():
    return records(query_df("SELECT name, district FROM locations ORDER BY name"))
