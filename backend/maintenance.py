"""Installer maintenance console (named maintenance.py: "installer" clashes with a PyPI package): triage lanes, fleet, KPIs, work orders, customer messages.

Every system is sorted into one lane, as of its own latest reading:
  technician  confirmed fault a customer can't fix (string, inverter)   -> schedule a visit
  customer    dust: the customer can fix it with a hose                 -> send a reminder
  watch       low but explained by weather, or slightly low, no fault   -> no action
  healthy

Messages are logged, and delivered for real to the presenter's Telegram / inbox when configured
(delivery.py). A production SMS gateway (MSG91, Twilio) plugs in there too.
"""
from datetime import date, timedelta

import numpy as np
import pandas as pd

from config import (INSTALLER_NAME, REAL_DELIVERY_MAX_PER_RUN, TARIFF_RS_PER_UNIT, TECHNICIANS,
                    UNDERPERFORMING_PCT, VISIT_COST_RS)
from db import get_conn, query_df
from delivery import deliver
from locations import LOCATIONS

LANES = ["technician", "customer", "watch", "healthy"]
ISSUE_NAMES = {"string_failure": "Panel string offline", "inverter_off": "Inverter not producing",
               "soiling": "Dust on panels"}
SPARK_DAYS = 30
COORDS = {name: (lat, lon) for name, _d, lat, lon in LOCATIONS}
COASTAL = {"Kasaragod", "Kannur", "Kozhikode", "Kochi", "Alappuzha", "Kollam", "Thiruvananthapuram"}


def approx_position(system_id, location):
    """Demo systems only know their district: spread them on a sunflower spiral (<= ~4 km)
    around the district centre so each roof is its own dot. Same spot every time."""
    lat, lon = COORDS[location]
    k = system_id % 17 + 1
    r, angle = 0.009 * np.sqrt(k), k * 2.39996                    # golden angle
    dlon = r * np.cos(angle)
    if location in COASTAL:
        dlon = abs(dlon)                                           # spread inland, not into the sea
    return float(round(lat + r * np.sin(angle), 5)), float(round(lon + dlon, 5))


def seed_demo_contacts():
    """Fake, clearly-demo contact details for systems that have none."""
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            UPDATE systems SET
              phone = '+91 90000 ' || LPAD(id::text, 5, '0'),
              email = LOWER(REGEXP_REPLACE(SPLIT_PART(COALESCE(owner_name, name), ' ', 1), '[^a-zA-Z]', '', 'g'))
                      || '.' || id || '@example.com'
            WHERE phone IS NULL OR email IS NULL
        """)


# --- Fleet ----------------------------------------------------------------------

def fleet():
    seed_demo_contacts()
    systems = query_df("""
        SELECT s.id, s.name, s.owner_name, s.location, s.capacity_kw, s.phone, s.email, s.source,
               s.install_date::text, s.warranty_until
        FROM systems s ORDER BY s.id
    """)
    latest = query_df("""
        SELECT DISTINCT ON (system_id) system_id, time::date AS as_of, rolling_7, label
        FROM health ORDER BY system_id, time DESC
    """).set_index("system_id")
    spark = query_df(f"""
        SELECT system_id, rolling_7 FROM (
            SELECT system_id, time, rolling_7,
                   ROW_NUMBER() OVER (PARTITION BY system_id ORDER BY time DESC) AS rn
            FROM health) t
        WHERE rn <= {SPARK_DAYS} ORDER BY system_id, time
    """).groupby("system_id")["rolling_7"].apply(lambda s: [round(float(v) * 100, 1) for v in s])
    alerts = query_df("""
        SELECT id, system_id, label, confidence, start_date, detected_date, fault_pct, loss_pct, weather_pct,
               rupees_per_month, audience, action, message, reasons
        FROM alerts WHERE status = 'open'
        ORDER BY (audience = 'technician') DESC, rupees_per_month DESC
    """).drop_duplicates("system_id").set_index("system_id")
    orders = query_df("""
        SELECT DISTINCT ON (system_id) id, system_id, technician, scheduled_date::text, status, created_by
        FROM work_orders WHERE status = 'scheduled' ORDER BY system_id, scheduled_date
    """).set_index("system_id")
    done = query_df("""
        SELECT DISTINCT ON (system_id) system_id, technician, scheduled_date
        FROM work_orders WHERE status = 'done' ORDER BY system_id, scheduled_date DESC
    """).set_index("system_id")
    notified = query_df("""
        SELECT DISTINCT ON (system_id) system_id, channel, kind, sent_at, created_by, status
        FROM notifications ORDER BY system_id, sent_at DESC
    """).set_index("system_id")

    rows = []
    for s in systems.itertuples():
        if s.id not in latest.index:
            continue
        l = latest.loc[s.id]
        health = round(float(l.rolling_7) * 100) if l.rolling_7 is not None else None
        issue = None
        if s.id in alerts.index:
            a = alerts.loc[s.id]
            issue = {
                "alert_id": int(a.id), "label": a.label, "name": ISSUE_NAMES[a.label],
                "confidence": round(float(a.confidence), 2), "start_date": str(a.start_date),
                "detected_date": str(a.detected_date), "fault_pct": round(float(a.fault_pct) * 100),
                "weather_pct": round(float(a.weather_pct) * 100),
                "rupees_per_month": round(float(a.rupees_per_month)), "action": a.action,
                "message": a.message, "reasons": a.reasons,
                "days_open": (l.as_of - a.start_date).days,
            }
            lane = "technician" if a.audience == "technician" else "customer"
        elif l.label == "weather_dip" or (health is not None and health < UNDERPERFORMING_PCT):
            lane = "watch"
        else:
            lane = "healthy"

        warranty = s.warranty_until
        covered = None
        if issue and warranty and lane == "technician":   # dust needs no visit: warranty doesn't apply
            covered = date.fromisoformat(issue["start_date"]) <= warranty
        order = orders.loc[s.id] if s.id in orders.index else None
        # Technician has been: the fault stays open until the data shows output is back
        if issue and order is None and s.id in done.index and str(done.loc[s.id].scheduled_date) >= issue["start_date"]:
            issue["verifying"] = {"technician": done.loc[s.id].technician,
                                  "visited": str(done.loc[s.id].scheduled_date)}
        note = notified.loc[s.id] if s.id in notified.index else None
        rows.append({
            "id": int(s.id), "name": s.name, "owner_name": s.owner_name, "location": s.location,
            "capacity_kw": float(s.capacity_kw), "phone": s.phone, "email": s.email, "source": s.source,
            "position": approx_position(int(s.id), s.location),
            "install_date": s.install_date, "warranty_until": str(warranty) if warranty else None,
            "warranty_covered": covered, "as_of": str(l.as_of), "health_pct": health,
            "today_label": l.label, "lane": lane, "issue": issue,
            "spark": spark.get(s.id, []),
            "work_order": None if order is None else {
                "id": int(order.id), "technician": order.technician, "created_by": order.created_by,
                "scheduled_date": order.scheduled_date, "status": order.status},
            "last_notified": None if note is None else {
                "channel": note.channel, "kind": note.kind, "sent_at": note.sent_at.isoformat(),
                "created_by": note.created_by, "status": note.status},
        })
    order_key = {lane: i for i, lane in enumerate(LANES)}
    rows.sort(key=lambda r: (order_key[r["lane"]], -(r["issue"] or {}).get("rupees_per_month", 0),
                             r["health_pct"] if r["health_pct"] is not None else 999))
    return rows


# --- Overview -------------------------------------------------------------------

def _weather_spells():
    """Low-output spells (3+ days) explained by weather: alarms a naive monitor would have raised."""
    df = query_df("""
        SELECT system_id, time::date AS day FROM health
        WHERE label = 'weather_dip' AND ratio < 0.85 ORDER BY system_id, time
    """)
    if df.empty:
        return 0
    df["day"] = pd.to_datetime(df["day"])
    new_spell = (df["system_id"] != df["system_id"].shift()) | (df["day"].diff() != pd.Timedelta(days=1))
    spells = df.assign(spell=new_spell.cumsum()).groupby("spell").size()
    return int((spells >= 3).sum())


def overview():
    rows = fleet()
    df = pd.DataFrame(rows)
    issues = pd.DataFrame([r["issue"] | {"covered": r["warranty_covered"], "lane": r["lane"]}
                           for r in rows if r["issue"]])
    tech = issues[issues["lane"] == "technician"] if not issues.empty else issues

    dust_alerts = int(query_df("SELECT COUNT(*) FROM alerts WHERE label = 'soiling'").iloc[0, 0])
    spells = _weather_spells()
    avoided = dust_alerts                          # problems the customer fixed without a technician

    trend = query_df("""
        SELECT time::date AS day, AVG(rolling_7) AS health, COUNT(*) AS n
        FROM health GROUP BY 1 HAVING COUNT(*) >= 10 ORDER BY 1 DESC LIMIT 180
    """).sort_values("day")

    by_area = []
    for loc, g in df.groupby("location"):
        counts = g["lane"].value_counts()
        by_area.append({
            "location": loc, "lat": COORDS[loc][0], "lon": COORDS[loc][1], "systems": len(g),
            **{lane: int(counts.get(lane, 0)) for lane in LANES},
            "avg_health": round(float(g["health_pct"].mean())),
            "rupees_per_month": round(sum((r or {}).get("rupees_per_month", 0) for r in g["issue"])),
        })
    by_area.sort(key=lambda a: (-(a["technician"] + a["customer"]), a["location"]))

    lanes = df["lane"].value_counts()
    scheduled = int(query_df("SELECT COUNT(*) FROM work_orders WHERE status = 'scheduled'").iloc[0, 0])
    return {
        "installer": INSTALLER_NAME,
        "as_of": df["as_of"].mode()[0],           # the date most systems report up to
        "kpis": {
            "systems": len(df),
            "capacity_kw": round(float(df["capacity_kw"].sum())),
            "fleet_health_pct": round(float(df["health_pct"].mean())),
            "underperforming": int((df["health_pct"] < UNDERPERFORMING_PCT).sum()),
            "lanes": {lane: int(lanes.get(lane, 0)) for lane in LANES},
            "rupees_lost_per_month": round(float(issues["rupees_per_month"].sum())) if not issues.empty else 0,
            "warranty_exposure": int((tech["covered"] == True).sum()) if not tech.empty else 0,  # noqa: E712
            "visits_scheduled": scheduled,
            "fixes_verifying": int(sum(1 for r in rows if (r["issue"] or {}).get("verifying"))),
            "visits_unscheduled": int(sum(1 for r in rows if r["lane"] == "technician" and not r["work_order"])),
            "avoided_visits": avoided,
            "avoided_visits_rs": avoided * VISIT_COST_RS,
            "false_alarms_avoided": spells,
        },
        "by_area": by_area,
        "trend": [{"day": str(d.day), "health": round(float(d.health) * 100, 1)} for d in trend.itertuples()],
        "activity": activity(8),
        "visit_cost_rs": VISIT_COST_RS,
        "tariff_rs": TARIFF_RS_PER_UNIT,
    }


# --- Customer messages ------------------------------------------------------------

def _d(iso):
    return date.fromisoformat(iso).strftime("%d %b %Y").lstrip("0") if iso else ""


def _first_name(system):
    owner = (system.get("owner_name") or "").replace(" residence", "").replace("(sample)", "").strip()
    return owner or "there"


def compose(system, kind, channel):
    """Ready-to-send message for a system; the installer can edit it before sending."""
    issue = system.get("issue") or {}
    order = system.get("work_order") or {}
    name, kw, loc = _first_name(system), system["capacity_kw"], system["location"]
    brand = INSTALLER_NAME.split(",")[0]
    rupees = issue.get("rupees_per_month", 0)

    if kind == "clean_panels":
        sms = (f"{brand}: Hi {name}, your {kw:g} kW solar in {loc} is making {issue.get('fault_pct', 0)}% less than "
               f"it should, most likely dust. Please rinse the panels with plain water early morning. "
               f"Reply HELP if you need us.")
        subject = "Your solar panels need a quick clean"
        body = (f"Dear {name},\n\nOur monitoring shows your {kw:g} kW rooftop system in {loc} has been producing "
                f"{issue.get('fault_pct', 0)}% less than the sun allowed since {_d(issue.get('start_date'))}. "
                f"Nearby systems are normal and there has been little rain, so dust on the panels is the most "
                f"likely cause. It is costing you about Rs {rupees:,} a month.\n\n"
                f"What to do: rinse the panels with plain water early in the morning or in the evening. "
                f"No soap, no hard brushes, and please don't climb onto the roof if it isn't safe; we can do it for you.\n\n"
                f"We'll confirm from your data within a few days that output is back to normal.\n\n{brand}")
    elif kind == "visit_scheduled":
        when = _d(order.get("scheduled_date")) or "soon"
        cover = ("This is covered under your workmanship warranty, no charge." if system.get("warranty_covered")
                 else "Our team will share the cost before starting any work.")
        sms = (f"{brand}: Hi {name}, we found a fault in your solar system ({issue.get('name', 'performance issue').lower()}). "
               f"Technician {order.get('technician', '')} will visit on {when}. {cover}")
        subject = f"We found a fault in your solar system: visit on {when}"
        body = (f"Dear {name},\n\nOur monitoring detected that your {kw:g} kW system in {loc} has dropped "
                f"{issue.get('fault_pct', 0)}% since {_d(issue.get('start_date'))}. The pattern points to: "
                f"{issue.get('name', 'a performance issue').lower()}. It is costing you about Rs {rupees:,} a month.\n\n"
                f"Our technician {order.get('technician', '')} will visit on {when}. {cover}\n\n"
                f"No action is needed from you. Please make sure the roof is accessible.\n\n{brand}")
    elif kind == "fault_found":
        sms = (f"{brand}: Hi {name}, your solar system has dropped {issue.get('fault_pct', 0)}% since "
               f"{_d(issue.get('start_date'))} ({issue.get('name', '').lower()}). We'll call you to fix a visit time.")
        subject = "We found a problem with your solar system"
        body = (f"Dear {name},\n\n{issue.get('message', '')}\n\nWe'll call you shortly to arrange a technician visit.\n\n{brand}")
    else:  # check_in
        sms = (f"{brand}: Hi {name}, good news: your {kw:g} kW solar system is working well "
               f"({system.get('health_pct')}% of what the sun allowed this week).")
        subject = "Your solar system is working well"
        body = (f"Dear {name},\n\nYour {kw:g} kW system in {loc} produced {system.get('health_pct')}% of what the sun "
                f"allowed over the last 7 days. Nothing to do.\n\n{brand}")
    if channel == "sms":
        return {"channel": "sms", "recipient": system["phone"], "subject": None, "message": sms}
    return {"channel": "email", "recipient": system["email"], "subject": subject, "message": body}


def suggested_kind(system):
    if system["lane"] == "customer":
        return "clean_panels"
    if system["lane"] == "technician":
        return "visit_scheduled" if system.get("work_order") else "fault_found"
    return "check_in"


def send_message(system_id, alert_id, channel, recipient, subject, message, kind,
                 created_by="installer", real=True, customer=None):
    """Log the message, and deliver it for real when Telegram / email is configured (see delivery.py).
    real=False only logs it (used to cap real deliveries in bulk runs)."""
    if real:
        status, via, error = deliver(channel, customer or recipient, recipient, subject, message)
    else:
        status, via, error = "logged_demo", None, None
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            INSERT INTO notifications (system_id, alert_id, channel, recipient, subject, message, kind, status,
                                       delivered_via, error, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id, sent_at
        """, (system_id, alert_id, channel, recipient, subject, message, kind, status, via, error, created_by))
        nid, sent_at = cur.fetchone()
    return {"id": nid, "status": status, "delivered_via": via, "error": error, "sent_at": sent_at.isoformat()}


def message_system(s, kind, channel, created_by="installer", real=True, text=None, subject=None):
    """Compose (unless text is given) and send the message for one fleet row."""
    m = compose(s, kind, channel)
    return send_message(s["id"], (s["issue"] or {}).get("alert_id"), channel, m["recipient"],
                        subject if subject is not None else m["subject"], text or m["message"], kind,
                        created_by=created_by, real=real, customer=s["owner_name"])


def notify_bulk(lane, channel):
    """Send the suggested message to every system in a lane not messaged in the last 7 days."""
    sent, delivered = [], 0
    for s in fleet():
        if s["lane"] != lane or recently_messaged(s):
            continue
        r = message_system(s, suggested_kind(s), channel, real=delivered < REAL_DELIVERY_MAX_PER_RUN)
        delivered += r["status"] == "sent"
        sent.append(s["id"])
    return {"sent": len(sent), "delivered": delivered, "system_ids": sent}


def recently_messaged(s, days=7):
    last = s["last_notified"]
    week_ago = pd.Timestamp.now(tz="Asia/Kolkata") - pd.Timedelta(days=days)
    return bool(last) and pd.Timestamp(last["sent_at"]) > week_ago


def notifications(limit=200):
    df = query_df("""
        SELECT n.id, n.system_id, s.name, s.owner_name, s.location, n.channel, n.recipient, n.subject,
               n.message, n.kind, n.status, n.delivered_via, n.error, n.created_by, n.sent_at
        FROM notifications n JOIN systems s ON s.id = n.system_id
        ORDER BY n.sent_at DESC LIMIT %s
    """, [limit])
    df["sent_at"] = df["sent_at"].map(lambda t: t.isoformat())
    return df


# --- Work orders -------------------------------------------------------------------

def create_work_order(system_id, alert_id, technician, scheduled_date, notes=None, created_by="installer"):
    if technician not in TECHNICIANS:
        raise ValueError(f"Unknown technician {technician}")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE work_orders SET status = 'cancelled' WHERE system_id = %s AND status = 'scheduled'",
                    (system_id,))
        cur.execute("""
            INSERT INTO work_orders (system_id, alert_id, technician, scheduled_date, notes, created_by)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
        """, (system_id, alert_id, technician, scheduled_date, notes, created_by))
        return cur.fetchone()[0]


def update_work_order(order_id, status):
    if status not in ("scheduled", "done", "cancelled"):
        raise ValueError(f"Bad status {status}")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE work_orders SET status = %s WHERE id = %s", (status, order_id))


def work_orders():
    df = query_df("""
        SELECT w.id, w.system_id, s.name, s.owner_name, s.location, s.phone, w.technician,
               w.scheduled_date::text, w.status, w.notes, w.created_by, a.label, a.rupees_per_month,
               (a.start_date <= s.warranty_until) AS warranty_covered
        FROM work_orders w JOIN systems s ON s.id = w.system_id
        LEFT JOIN LATERAL (SELECT * FROM alerts WHERE system_id = w.system_id AND status = 'open'
                           AND audience = 'technician' ORDER BY rupees_per_month DESC LIMIT 1) a ON TRUE
        WHERE w.status <> 'cancelled'
        ORDER BY (w.status = 'done'), w.scheduled_date, s.location
    """)
    df["issue_name"] = df["label"].map(ISSUE_NAMES)
    return df


def activity(limit=8):
    df = query_df("""
        (SELECT 'message' AS type, n.sent_at AS at, s.owner_name, s.location, n.created_by,
                n.channel || ': ' || n.kind AS what
         FROM notifications n JOIN systems s ON s.id = n.system_id)
        UNION ALL
        (SELECT 'visit' AS type, w.created_at AS at, s.owner_name, s.location, w.created_by,
                w.status || ': ' || w.technician || ' on ' || w.scheduled_date AS what
         FROM work_orders w JOIN systems s ON s.id = w.system_id)
        ORDER BY at DESC LIMIT %s
    """, [limit])
    return [{"type": r.type, "at": r.at.isoformat(), "owner_name": r.owner_name, "location": r.location,
             "what": r.what, "created_by": r.created_by} for r in df.itertuples()]


def suggested_visit_date(as_of):
    """Next working day after 'today' for the demo data."""
    d = date.fromisoformat(as_of) + timedelta(days=1)
    while d.weekday() == 6:
        d += timedelta(days=1)
    return str(d)


if __name__ == "__main__":
    import json
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    o = overview()
    print(json.dumps(o["kpis"], indent=1))
    print(o["by_area"][:3])
    f = fleet()
    print(f[0]["name"], f[0]["lane"], f[0]["issue"]["name"], f[0]["warranty_covered"], len(f[0]["spark"]))
    print(compose(f[0], suggested_kind(f[0]), "sms")["message"])
