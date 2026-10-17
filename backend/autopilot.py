"""Autopilot: acts on the work queue without the installer clicking anything.

Rules (deterministic, so every action is explainable):
  1. Fault a technician must fix, no visit booked  -> book the next working day
       technician = whoever is already in that area that day, else the least busy one
       (max MAX_VISITS_PER_DAY per technician), then SMS the customer the date
  2. Dust, customer not messaged in 7 days          -> SMS a cleaning reminder
  3. Weather dips and healthy systems               -> nothing
Real delivery (Telegram / email) is capped per run so a demo doesn't flood your phone.

Runs when the installer turns it on, on "Run now", and whenever new inverter data is imported.
"""
import json
from collections import Counter
from datetime import date, timedelta

import pandas as pd

import maintenance
from config import REAL_DELIVERY_MAX_PER_RUN, TECHNICIANS
from db import get_conn, query_df

MAX_VISITS_PER_DAY = 4


def get_settings():
    df = query_df("SELECT value FROM settings WHERE key = 'autopilot'")
    return df.iloc[0, 0] if not df.empty else {"enabled": False, "last_run": None, "last_summary": None}


def save_settings(value):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""INSERT INTO settings (key, value) VALUES ('autopilot', %s)
                       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value""", (json.dumps(value),))


def set_enabled(enabled):
    s = get_settings()
    s["enabled"] = bool(enabled)
    save_settings(s)
    return run() if enabled else {"settings": s}


def _next_working_day(d):
    d += timedelta(days=1)
    while d.weekday() == 6:                      # no Sunday visits
        d += timedelta(days=1)
    return d


def _plan_visit(system, booked):
    """booked: Counter of (technician, day) and set of (technician, day, area)."""
    day = _next_working_day(date.fromisoformat(system["as_of"]))
    for _ in range(14):
        same_area = [t for t in TECHNICIANS if (t, day, system["location"]) in booked["areas"]]
        free = [t for t in TECHNICIANS if booked["count"][(t, day)] < MAX_VISITS_PER_DAY]
        choice = next((t for t in same_area if t in free), None) or \
            min(free, key=lambda t: booked["count"][(t, day)], default=None)
        if choice:
            return choice, day
        day = _next_working_day(day)
    return None, None


def run():
    settings = get_settings()
    fleet = maintenance.fleet()
    orders = query_df("SELECT technician, scheduled_date, system_id FROM work_orders WHERE status = 'scheduled'")
    loc = {s["id"]: s["location"] for s in fleet}
    booked = {"count": Counter(), "areas": set()}
    for o in orders.itertuples():
        booked["count"][(o.technician, o.scheduled_date)] += 1
        booked["areas"].add((o.technician, o.scheduled_date, loc.get(o.system_id)))

    visits, messages, delivered = [], [], 0
    for s in fleet:
        if s["lane"] == "technician" and not s["work_order"] and not s["issue"].get("verifying"):
            tech, day = _plan_visit(s, booked)
            if not tech:
                continue
            maintenance.create_work_order(s["id"], s["issue"]["alert_id"], tech, day, created_by="autopilot",
                                          notes="Booked automatically by Soorya autopilot")
            booked["count"][(tech, day)] += 1
            booked["areas"].add((tech, day, s["location"]))
            s["work_order"] = {"technician": tech, "scheduled_date": str(day)}
            visits.append({"system_id": s["id"], "owner_name": s["owner_name"], "location": s["location"],
                           "issue": s["issue"]["name"], "technician": tech, "date": str(day)})
            kind = "visit_scheduled"
        elif s["lane"] == "customer" and not maintenance.recently_messaged(s):
            kind = "clean_panels"
        else:
            continue
        r = maintenance.message_system(s, kind, "sms", created_by="autopilot",
                                       real=delivered < REAL_DELIVERY_MAX_PER_RUN)
        delivered += r["status"] == "sent"
        messages.append({"system_id": s["id"], "owner_name": s["owner_name"], "kind": kind, "status": r["status"]})

    summary = {"visits_booked": len(visits), "messages_sent": len(messages), "delivered": delivered}
    settings.update(last_run=pd.Timestamp.now(tz="Asia/Kolkata").isoformat(), last_summary=summary)
    save_settings(settings)
    return {"settings": settings, "visits": visits, "messages": messages, **summary}


def maybe_run():
    """Call after new data arrives: acts only if the installer has turned autopilot on."""
    return run() if get_settings().get("enabled") else None


if __name__ == "__main__":
    r = run()
    print(f"{r['visits_booked']} visits booked, {r['messages_sent']} messages, {r['delivered']} delivered for real")
    for v in r["visits"]:
        print(f"  {v['date']} {v['technician']:12} {v['location']:15} {v['owner_name']} ({v['issue']})")
