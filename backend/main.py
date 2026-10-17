from datetime import date

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import ROOT
from csv_import import ImportError_, delete_system, import_system
from customer import monthly_report, system_summary
from db import db_status, query_df
from expected import get_health
import agent
import maintenance
import sim_clock
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
    return maintenance.overview()


@app.get("/api/installer/fleet")
def installer_fleet():
    return maintenance.fleet()


@app.get("/api/installer/technicians")
def installer_technicians():
    from config import TECHNICIANS
    return TECHNICIANS


def _system(system_id):
    s = next((r for r in maintenance.fleet() if r["id"] == system_id), None)
    if s is None:
        raise HTTPException(404, "System not found")
    return s


@app.get("/api/installer/systems/{system_id}/compose")
def installer_compose(system_id: int, channel: str = "sms", kind: str | None = None):
    """Ready-made message the installer can edit before sending."""
    s = _system(system_id)
    kind = kind or maintenance.suggested_kind(s)
    return {"kind": kind, **maintenance.compose(s, kind, channel)}


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
    return maintenance.message_system(s, req.kind, req.channel, text=req.message, subject=req.subject)


class BulkNotifyRequest(BaseModel):
    lane: str = "customer"
    channel: str = "sms"


@app.post("/api/installer/notify/bulk")
def installer_notify_bulk(req: BulkNotifyRequest):
    return maintenance.notify_bulk(req.lane, req.channel)


@app.get("/api/installer/notifications")
def installer_notifications():
    return records(maintenance.notifications())


class WorkOrderRequest(BaseModel):
    system_id: int
    technician: str
    scheduled_date: date
    notes: str | None = None


@app.post("/api/installer/work-orders")
def installer_create_work_order(req: WorkOrderRequest):
    s = _system(req.system_id)
    try:
        oid = maintenance.create_work_order(s["id"], (s["issue"] or {}).get("alert_id"), req.technician,
                                          req.scheduled_date, req.notes)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"id": oid}


class WorkOrderUpdate(BaseModel):
    status: str


@app.patch("/api/installer/work-orders/{order_id}")
def installer_update_work_order(order_id: int, req: WorkOrderUpdate):
    try:
        maintenance.update_work_order(order_id, req.status)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@app.get("/api/installer/work-orders")
def installer_work_orders():
    return records(maintenance.work_orders())



# --- Maintenance agent --------------------------------------------------------------

@app.get("/api/agent")
def agent_status():
    from delivery import channels
    return {"settings": agent.get_settings(), "summary": agent.summary(), "delivery": channels(),
            "causes": agent.CAUSES}


class AgentToggle(BaseModel):
    enabled: bool


@app.post("/api/agent")
def agent_toggle(req: AgentToggle):
    """Turning the agent on acts on the current faults immediately."""
    return agent.set_enabled(req.enabled)


@app.post("/api/agent/run")
def agent_run():
    return agent.step()


class Advance(BaseModel):
    days: int = 3


@app.post("/api/agent/advance")
def agent_advance(req: Advance):
    """Demo clock: generate the next days of data, re-run detection, let the agent act."""
    try:
        moved = sim_clock.advance(max(1, min(req.days, 7)))
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    return {"moved": moved, **agent.step()}


@app.get("/api/agent/tickets")
def agent_tickets(status: str | None = None):
    return records(agent.tickets(status))


class Approve(BaseModel):
    order_ids: list[int] | None = None


@app.post("/api/agent/approve")
def agent_approve(req: Approve):
    return agent.approve(req.order_ids)


@app.post("/api/agent/tickets/{ticket_id}/technician")
def agent_send_technician(ticket_id: int):
    return agent.send_technician(ticket_id)


class VisitDone(BaseModel):
    outcome: str = "fixed"           # fixed | not_fixed
    cause: str | None = None         # actual cause (fixed)
    note: str | None = None          # e.g. "needs new inverter board"


@app.post("/api/installer/work-orders/{order_id}/complete")
def complete_work_order(order_id: int, req: VisitDone):
    """Technician reports back: fixed (with the actual cause) or couldn't fix (agent books a follow-up)."""
    if req.outcome not in ("fixed", "not_fixed") or (req.outcome == "fixed" and not req.cause):
        raise HTTPException(400, "Pick the cause, or report that it couldn't be fixed")
    result = agent.complete_visit(order_id, req.cause, req.outcome, req.note)
    if req.outcome == "fixed":
        sim_clock.on_visit_done(result)
    return result


@app.get("/api/technicians")
def technicians_with_bases():
    from config import TECH_BASES
    return [{"name": n, "base": b} for n, b in TECH_BASES.items()]


@app.get("/api/technicians/{name}/jobs")
def technician_jobs(name: str):
    """The technician's phone view: booked visits in driving order."""
    from config import TECH_BASES
    if name not in TECH_BASES:
        raise HTTPException(404, "Unknown technician")
    return agent.technician_jobs(name)


@app.post("/api/agent/retrain")
def agent_retrain():
    from train import train
    m = train()
    return {"accuracy": m["accuracy"], "rows": m["rows"]}


# Owner side: links in the email (no login in the demo; the token is the key)
@app.get("/api/respond/{token}")
def owner_ticket(token: str):
    t = agent.ticket_public(token)
    if t is None:
        raise HTTPException(404, "This link is not valid")
    return t


class OwnerAction(BaseModel):
    action: str


@app.post("/api/respond/{token}")
def owner_respond(token: str, req: OwnerAction):
    try:
        result = agent.respond(token, req.action)
    except ValueError as e:
        raise HTTPException(400, str(e))
    sim_clock.on_owner_action(result)
    return result


@app.get("/api/systems/{system_id}/ticket")
def system_ticket(system_id: int):
    """Open agent ticket for the customer app (owner buttons)."""
    t = agent.tickets("open").query("system_id == @system_id")
    if t.empty:
        return None
    row = t.iloc[0]
    return {**agent.ticket_public(row["token"]), "token": row["token"]}
