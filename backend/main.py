from datetime import date

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from audit import read_bill, read_quote, save_audit, verdict
from config import ROOT
from csv_import import ImportError_, delete_system, import_system
from customer import monthly_report, system_summary
from db import db_status, query_df
from expected import get_health
import installer
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


@app.get("/api/systems/{system_id}/summary")
def system_summary_api(system_id: int):
    summary = system_summary(system_id)
    if summary is None:
        raise HTTPException(404, "System not found or has no data yet")
    return summary


def _import(raw, owner_name, location, capacity_kw, install_date, warranty_until):
    try:
        return import_system(raw, owner_name, location, capacity_kw, install_date, warranty_until)
    except ImportError_ as e:
        raise HTTPException(400, str(e))


@app.post("/api/systems/import")
async def import_csv(
    file: UploadFile = File(...),
    owner_name: str = Form(...),
    location: str = Form(...),
    capacity_kw: float = Form(...),
    install_date: date | None = Form(None),
    warranty_until: date | None = Form(None),
):
    """Customer uploads their inverter portal export and gets a monitored system."""
    return _import(await file.read(), owner_name, location, capacity_kw, install_date, warranty_until)


DEMO_CSV = ROOT / "data" / "samples" / "sample_daily_export.csv"
DEMO_OWNER = "Menon residence (sample)"


@app.post("/api/systems/import/demo")
def import_demo():
    """Sample export (real 2026 Kochi weather, string failure from 20 Aug 2026). Replaces any earlier demo import."""
    if not DEMO_CSV.exists():
        raise HTTPException(404, "Run tools/make_sample_exports.py first")
    delete_system(DEMO_OWNER)
    return _import(DEMO_CSV.read_bytes(), DEMO_OWNER, "Kochi", 4.0, date(2025, 11, 20), date(2030, 11, 20))


@app.get("/api/systems/{system_id}/report")
def system_report(system_id: int, month: str | None = None):
    """Monthly report; month as YYYY-MM, default the latest month with data."""
    report = monthly_report(system_id, month)
    if report is None:
        raise HTTPException(404, "No data for this system yet")
    return report


# --- Installer console ------------------------------------------------------------

@app.get("/api/installer/overview")
def installer_overview():
    return installer.overview()


@app.get("/api/installer/fleet")
def installer_fleet():
    return installer.fleet()


@app.get("/api/installer/technicians")
def installer_technicians():
    from config import TECHNICIANS
    return TECHNICIANS


def _system(system_id):
    s = next((r for r in installer.fleet() if r["id"] == system_id), None)
    if s is None:
        raise HTTPException(404, "System not found")
    return s


@app.get("/api/installer/systems/{system_id}/compose")
def installer_compose(system_id: int, channel: str = "sms", kind: str | None = None):
    """Ready-made message the installer can edit before sending."""
    s = _system(system_id)
    kind = kind or installer.suggested_kind(s)
    return {"kind": kind, **installer.compose(s, kind, channel)}


class NotifyRequest(BaseModel):
    system_id: int
    channel: str                 # sms | email
    kind: str
    message: str
    subject: str | None = None


@app.post("/api/installer/notify")
def installer_notify(req: NotifyRequest):
    if req.channel not in ("sms", "email"):
        raise HTTPException(400, "channel must be sms or email")
    s = _system(req.system_id)
    recipient = s["phone"] if req.channel == "sms" else s["email"]
    return installer.send_message(s["id"], (s["issue"] or {}).get("alert_id"), req.channel, recipient,
                                  req.subject, req.message, req.kind)


class BulkNotifyRequest(BaseModel):
    lane: str = "customer"
    channel: str = "sms"


@app.post("/api/installer/notify/bulk")
def installer_notify_bulk(req: BulkNotifyRequest):
    return installer.notify_bulk(req.lane, req.channel)


@app.get("/api/installer/notifications")
def installer_notifications():
    return records(installer.notifications())


class WorkOrderRequest(BaseModel):
    system_id: int
    technician: str
    scheduled_date: date
    notes: str | None = None


@app.post("/api/installer/work-orders")
def installer_create_work_order(req: WorkOrderRequest):
    s = _system(req.system_id)
    try:
        oid = installer.create_work_order(s["id"], (s["issue"] or {}).get("alert_id"), req.technician,
                                          req.scheduled_date, req.notes)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"id": oid}


class WorkOrderUpdate(BaseModel):
    status: str


@app.patch("/api/installer/work-orders/{order_id}")
def installer_update_work_order(order_id: int, req: WorkOrderUpdate):
    try:
        installer.update_work_order(order_id, req.status)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@app.get("/api/installer/work-orders")
def installer_work_orders():
    return records(installer.work_orders())
