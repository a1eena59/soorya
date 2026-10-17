"""Maintenance agent: runs every confirmed fault from detection to a verified fix.

Stage 1  Triage        wait | owner_action | data_fix | technician | ignore      (plain code; LLM only breaks ties)
Stage 2  Owner         SMS with a reply link (Done / Book cleaning / Call me); one reminder; escalate by ₹ or close
Stage 3  Verify        3–5 days of weather-adjusted output vs neighbours: recovered -> close, else escalate
Stage 4  Technician    job card, area-grouped daily routes, installer approves the batch, reminders the day before
Stage 5  Learn         technician's confirmed cause + recovery -> labelled dataset for retraining
Stage 6  Report        summary() for the installer

Only faults that have persisted AGENT_PERSIST_DAYS get a ticket. Every step is logged in tickets.events.
The agent decides; the demo world (what owners/technicians physically fix) lives in sim_clock.py.
"""
import json
import secrets
from collections import Counter
from datetime import date, timedelta

import numpy as np
import pandas as pd

import llm
import maintenance
from config import (AGENT_ESCALATE_ABOVE_RS, AGENT_IGNORE_BELOW_RS, AGENT_PERSIST_DAYS, AGENT_RECOVERED_PCT,
                    AGENT_REMIND_AFTER_DAYS, FRONTEND_URL, REAL_DELIVERY_MAX_PER_RUN, ROAD_FACTOR, TECH_BASES,
                    TECHNICIANS)
from db import get_conn, query_df
from locations import LOCATIONS

MAX_VISITS_PER_DAY = 4
MONSOON = {6, 7, 8, 9}
COORDS = {n: (lat, lon) for n, _d, lat, lon in LOCATIONS}

CAUSES = {
    "string_failure": ["MC4 connector burnt", "String fuse blown", "Damaged panel", "Loose DC cable"],
    "inverter_off": ["Inverter tripped (reset)", "Inverter board failure", "AC breaker faulty", "Grid voltage issue"],
    "soiling": ["Panels cleaned (dust)", "Bird droppings removed"],
}
PARTS = {
    "string_failure": "MC4 connectors, string fuses, DC cable",
    "inverter_off": "Spare inverter board, AC breaker",
    "soiling": "Cleaning kit",
}
FAULT_NAME = {"soiling": "dust on the panels", "string_failure": "a panel string offline",
              "inverter_off": "the inverter not producing", "data_gap": "monitoring data missing"}


# --- settings ---------------------------------------------------------------------

def get_settings():
    df = query_df("SELECT value FROM settings WHERE key = 'agent'")
    return df.iloc[0, 0] if not df.empty else {"enabled": False, "last_run": None}


def save_settings(value):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""INSERT INTO settings (key, value) VALUES ('agent', %s)
                       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value""", (json.dumps(value),))


def set_enabled(enabled):
    s = get_settings()
    s["enabled"] = bool(enabled)
    save_settings(s)
    return step() if enabled else {"actions": [], "settings": s}


# --- tickets ----------------------------------------------------------------------

def tickets(status=None):
    sql = """SELECT t.*, s.owner_name, s.name AS system_name, s.location, s.capacity_kw, s.phone, s.email,
                    s.inverter_model, s.warranty_until::text
             FROM tickets t JOIN systems s ON s.id = t.system_id"""
    df = query_df(sql + (" WHERE t.status = %s" if status else "") + " ORDER BY t.updated_at DESC",
                  [status] if status else None)
    for c in ("opened_on", "recheck_on", "notified_on", "verify_from"):
        df[c] = df[c].map(lambda d: str(d) if d is not None and not pd.isna(d) else None)
    df["updated_at"] = df["updated_at"].map(lambda t: t.isoformat())
    return df


def _ticket(tid):
    return tickets().set_index("id").loc[tid].to_dict() | {"id": tid}


def _update(tid, today, event=None, by="agent", **fields):
    sets = ", ".join(f"{k} = %s" for k in fields)
    params = list(fields.values())
    with get_conn() as conn, conn.cursor() as cur:
        if event:
            cur.execute(f"""UPDATE tickets SET {sets + ', ' if sets else ''}updated_at = now(),
                            events = events || %s::jsonb WHERE id = %s""",
                        params + [json.dumps([{"day": str(today), "by": by, "text": event}]), tid])
        else:
            cur.execute(f"UPDATE tickets SET {sets}, updated_at = now() WHERE id = %s", params + [tid])


def _open_ticket(s, route, stage, reason, today, **fields):
    issue = s["issue"]
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            INSERT INTO tickets (system_id, fault, route, stage, loss_rs, confidence, reason, opened_on, token, events,
                                 recheck_on)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
        """, (s["id"], issue["label"], route, stage, issue["rupees_per_month"], issue["confidence"], reason, today,
              secrets.token_urlsafe(10),
              json.dumps([{"day": str(today), "by": "agent",
                           "text": f"Opened: {FAULT_NAME[issue['label']]} for {issue['days_open']} days, "
                                   f"output down {issue['fault_pct']}%. Route: {route.replace('_', ' ')}. {reason}"}]),
              fields.get("recheck_on")))
        return cur.fetchone()[0]


def _close(tid, today, resolution, event, by="agent", label=None):
    _update(tid, today, event, by=by, status="closed", stage="closed", resolution=resolution)
    if label:                                   # Stage 5: (pattern -> confirmed cause) into the labelled dataset
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""INSERT INTO confirmed_labels (system_id, fault, cause, start_date, end_date, source)
                           VALUES (%s, %s, %s, %s, %s, %s)""", label)


# --- Stage 1: triage ----------------------------------------------------------------

def rain_forecast(location, today, days=3):
    """Rain (mm) for the next `days` days. Demo data is historical, so the 'forecast' is the
    real weather that followed, fetched from Open-Meteo like the rest of the weather."""
    from weather import load_range
    start, end = today + timedelta(days=1), today + timedelta(days=days)
    df = query_df("SELECT rain_mm FROM weather WHERE location = %s AND time::date BETWEEN %s AND %s ORDER BY time",
                  [location, start, end])
    if len(df) < days:
        try:
            lat, lon = COORDS[location]
            load_range(location, lat, lon, str(start), str(end))
            df = query_df("SELECT rain_mm FROM weather WHERE location = %s AND time::date BETWEEN %s AND %s",
                          [location, start, end])
        except Exception:
            return []
    return [float(x) for x in df["rain_mm"]]


def triage(s, today, fleet_day):
    issue, loss = s["issue"], s["issue"]["rupees_per_month"]
    if s["as_of"] < str(fleet_day - timedelta(days=1)):
        return "data_fix", f"No data since {s['as_of']} while other systems report: a data gap, not a fault."
    if loss < AGENT_IGNORE_BELOW_RS:
        return "ignore", "Loss is too small to be worth a notification."
    fault = issue["label"]
    if fault == "soiling":
        rain = rain_forecast(s["location"], today)
        heavy = rain and (max(rain) >= 10 or sum(rain) >= 20)
        if heavy:
            return "wait", f"Heavy rain expected in the next 3 days ({sum(rain):.0f} mm). It will likely wash the panels."
        if rain and 4 <= max(rain) < 10:                     # edge case: some rain, maybe not enough
            route, why = llm.choose_route(
                {"fault": "dust", "rain_next_3_days_mm": rain, "loss_rs_per_month": loss, "month": today.month},
                ["wait", "owner_action"], "owner_action")
            return route, why or f"Only light rain expected ({sum(rain):.0f} mm): unlikely to clean the panels."
        return "owner_action", "Dust on the panels: the owner can clean them."
    if fault == "inverter_off":
        recent = query_df("""SELECT COUNT(*) FROM tickets WHERE system_id = %s AND fault = 'inverter_off'
                             AND status = 'closed' AND opened_on > %s""", [s["id"], today - timedelta(days=60)]).iloc[0, 0]
        if recent:
            return "technician", "Inverter stopped again within 60 days: a restart won't hold."
        return "owner_action", "Inverter stopped: often just tripped. A restart by the owner may fix it."
    return "technician", f"{FAULT_NAME[fault].capitalize()}: needs a technician."


# --- Stage 2: owner messages ------------------------------------------------------------

def _d(iso):
    return pd.Timestamp(iso).strftime("%d %b %Y").lstrip("0") if iso else ""


def _owner_message(t, s, kind, today, extra=None, use_llm=True):
    """Returns subject, text, buttons [(action, label)], source."""
    name = (s["owner_name"] or "").replace(" residence", "")
    issue = s["issue"] or {}
    pct = issue.get("fault_pct", 0)
    rs = int(t["loss_rs"] or 0)
    monsoon = today.month in MONSOON
    if kind == "owner_action" and t["fault"] == "soiling":
        subject = "Your solar panels need a clean"
        fallback = (f"Your system made {pct}% less than expected over the last {issue.get('days_open', 7)} days "
                    f"(about ₹{rs:,}/month). This looks like dust. Rinse the panels with plain water from a safe spot, "
                    "or tap Book cleaning. Tap Done once they're clean.")
        if monsoon:
            fallback += " It's monsoon and roofs are slippery, so we recommend Book cleaning."
        buttons = [("done", "Done"), ("book_cleaning", "Book cleaning"), ("call_me", "Call me")]
        facts = {"name": name, "loss_percent": pct, "rupees_per_month": rs, "likely_cause": "dust",
                 "what_owner_can_do": "rinse panels with plain water from a safe spot, or tap Book cleaning",
                 "monsoon": monsoon, "buttons": ["Done", "Book cleaning", "Call me"]}
    elif kind == "owner_action":
        subject = "Your inverter has stopped"
        fallback = (f"Your inverter has produced almost nothing since {_d(issue.get('start_date'))} (about ₹{rs:,}/month). "
                    "It has often just tripped. Switch the AC breaker next to the inverter off, wait 1 minute, "
                    "switch it on, then tap Done. Or tap Call me and we'll check it.")
        buttons = [("done", "Done"), ("call_me", "Call me")]
        facts = {"name": name, "rupees_per_month": rs, "likely_cause": "inverter tripped",
                 "what_owner_can_do": "switch the AC breaker next to the inverter off for 1 minute and on again",
                 "buttons": ["Done", "Call me"]}
    elif kind == "data_fix":
        subject = "We're not receiving data from your solar system"
        fallback = ("We haven't received data from your system for a few days. Your panels are probably fine: "
                    "the monitoring dongle may be offline. Check your Wi-Fi router is on and unplug the dongle for "
                    "10 seconds. Tap Done when it's back.")
        buttons = [("done", "Done"), ("call_me", "Call me")]
        facts = None
    elif kind == "reminder":
        subject = "Reminder: your solar system still needs attention"
        fallback = (f"Your system is still making about {pct}% less than it should (₹{rs:,}/month). "
                    "Tap Done once you've taken care of it, or Call me if you'd like help.")
        buttons = [("done", "Done"), ("book_cleaning", "Book cleaning"), ("call_me", "Call me")] \
            if t["fault"] == "soiling" else [("done", "Done"), ("call_me", "Call me")]
        facts = None
    elif kind == "visit":
        o = extra
        cover = "covered by your warranty, no charge" if s.get("warranty_covered") else "we'll share the cost before starting"
        subject = f"Technician visit on {pd.Timestamp(o['scheduled_date']):%d %b}"
        fallback = (f"We found {FAULT_NAME[t['fault']]} in your solar system (about ₹{rs:,}/month lost). "
                    f"{o['technician']} will visit on {pd.Timestamp(o['scheduled_date']):%A %d %b}. This is {cover}. "
                    "Tap Confirm, or Another day if that doesn't suit you.")
        buttons = [("confirm", "Confirm"), ("another_day", "Another day")]
        facts = None
    elif kind == "visit_reminder":
        subject = "Technician visit tomorrow"
        fallback = f"Reminder: {extra['technician']} visits your solar system tomorrow. Please keep the roof accessible."
        buttons = []
        facts = None
    else:                                                  # closed_ok
        subject = "Your solar system is back to normal"
        fallback = "Good news: your system is producing what the sun allows again. Thank you!"
        buttons = []
        facts = None
    text, source = (llm.write_message(facts, fallback) if facts and use_llm else (fallback, "template"))
    return subject, text, buttons, source


def notify_owner(t, s, kind, today, budget, extra=None):
    real = budget["left"] > 0
    # The LLM writes only the messages that are really delivered (keeps a run fast)
    subject, text, buttons, source = _owner_message(t, s, kind, today, extra, use_llm=real)
    # SMS: one reply link opens the owner's page with the buttons (Done / Book cleaning / Call me)
    link = f"\nReply: {FRONTEND_URL}/respond/{t['token']}" if buttons else ""
    r = maintenance.send_message(s["id"], None, "sms", s["phone"], subject, f"{text}{link}", kind,
                                 created_by="agent", real=real, customer=s["owner_name"])
    if real:
        budget["left"] -= 1                    # count attempts, so a run stays fast even without delivery set up
    return r, source


# --- Stage 3: verification -----------------------------------------------------------------

def recovery(system_id, from_day):
    """(days of data since from_day, % of expected relative to neighbours)."""
    df = query_df("""
        SELECT h.time::date AS day, h.ratio,
               (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY p.ratio) FROM health p
                JOIN systems ps ON ps.id = p.system_id
                WHERE p.time = h.time AND ps.location = s.location AND p.system_id <> h.system_id) AS peer
        FROM health h JOIN systems s ON s.id = h.system_id
        WHERE h.system_id = %s AND h.time::date >= %s ORDER BY h.time
    """, [system_id, from_day])
    if df.empty:
        return 0, None
    rel = df["ratio"] / df["peer"].fillna(1.0).clip(lower=0.3)
    return len(df), round(float(np.median(rel)) * 100)


# --- Stage 4: technician jobs -----------------------------------------------------------------

def _next_working_day(d):
    d += timedelta(days=1)
    while d.weekday() == 6:
        d += timedelta(days=1)
    return d


def km(a, b):
    """Rough road km between two districts (great-circle x road factor)."""
    (la1, lo1), (la2, lo2) = COORDS[a], COORDS[b]
    x = np.radians([la1, lo1, la2, lo2])
    h = np.sin((x[2] - x[0]) / 2) ** 2 + np.cos(x[0]) * np.cos(x[2]) * np.sin((x[3] - x[1]) / 2) ** 2
    return float(2 * 6371 * np.arcsin(np.sqrt(h)) * ROAD_FACTOR)


def _plan(s, today):
    """Pick technician + day:
       1. a technician already visiting this area that day (no extra travel)
       2. else the technician closest to it: from their home base or any stop already that day
       never more than MAX_VISITS_PER_DAY each; if everyone is full, try the next working day."""
    orders = query_df("""SELECT w.technician, w.scheduled_date, s.location FROM work_orders w
                         JOIN systems s ON s.id = w.system_id WHERE w.status IN ('scheduled', 'proposed')""")
    count = Counter(zip(orders["technician"], orders["scheduled_date"]))
    areas = {}
    for o in orders.itertuples():
        areas.setdefault((o.technician, o.scheduled_date), set()).add(o.location)
    day = _next_working_day(today)
    for _ in range(14):
        free = [t for t in TECHNICIANS if count[(t, day)] < MAX_VISITS_PER_DAY]
        same = [t for t in free if s["location"] in areas.get((t, day), set())]
        if same:
            return same[0], day, 0.0
        if free:
            def extra(t):                                      # from home base or any stop that day
                stops = areas.get((t, day), set()) | {TECH_BASES[t]}
                return min(km(x, s["location"]) for x in stops)
            best = min(free, key=extra)
            return best, day, round(extra(best))
        day = _next_working_day(day)
    return TECHNICIANS[0], day, None


def job_card(t, s, job):
    issue = s["issue"] or {}
    cover = "Under warranty" if s.get("warranty_covered") else "Billable"
    cause = "Panel cleaning" if job == "cleaning" else f"Likely {FAULT_NAME[t['fault']]} ({round((t['confidence'] or 0) * 100)}% sure)"
    evidence = "; ".join((issue.get("reasons") or [])[:2])
    return (f"{cause}. Inverter: {s.get('inverter_model') or 'unknown'}. "
            f"Bring: {PARTS['soiling' if job == 'cleaning' else t['fault']]}. {cover}. Evidence: {evidence}")


def propose_visit(t, s, today, job="repair"):
    tech, day, extra_km = _plan(s, today)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""INSERT INTO work_orders (system_id, technician, scheduled_date, status, notes, created_by, job)
                       VALUES (%s, %s, %s, 'proposed', %s, 'agent', %s) RETURNING id""",
                    (s["id"], tech, day, job_card(t, s, job), job))
        oid = cur.fetchone()[0]
    where = "already in the area that day" if extra_km == 0 else f"nearest free, ~{extra_km} km" if extra_km else "earliest free"
    _update(t["id"], today, f"Proposed {tech} on {day:%d %b} ({job}; {where}). Waiting for installer approval.",
            stage="technician", route="technician", work_order_id=oid)
    return oid


def approve(order_ids=None):
    """Installer approves proposed visits (all, or a list): book them and tell each owner."""
    df = query_df("SELECT id FROM work_orders WHERE status = 'proposed'" +
                  (" AND id = ANY(%s)" if order_ids else ""), [order_ids] if order_ids else None)
    fleet = {s["id"]: s for s in maintenance.fleet()}
    by_order = {int(r.work_order_id): r._asdict() for r in tickets("open").itertuples() if not pd.isna(r.work_order_id)}
    budget = {"left": REAL_DELIVERY_MAX_PER_RUN}
    for oid in (int(x) for x in df["id"]):
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""UPDATE work_orders SET status = 'scheduled' WHERE id = %s
                           RETURNING system_id, technician, scheduled_date""", (oid,))
            sid, tech, day = cur.fetchone()
        t = by_order.get(oid)
        if t:
            s = fleet[sid]
            today = date.fromisoformat(s["as_of"])
            notify_owner(t, s, "visit", today, budget, {"technician": tech, "scheduled_date": str(day)})
            _update(int(t["id"]), today, f"Installer approved. {tech} booked for {day:%d %b}; owner told by SMS.",
                    by="installer")
    return {"approved": len(df)}


def complete_visit(order_id, cause=None, outcome="fixed", note=None):
    """Technician reports back from the field (Stage 5 input).
    fixed     -> actual cause recorded; the agent verifies from the next days' output
    not_fixed -> note (e.g. parts needed); the agent proposes a follow-up visit"""
    status = "done" if outcome == "fixed" else "not_fixed"
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""UPDATE work_orders SET status = %s, confirmed_cause = %s, tech_notes = %s WHERE id = %s
                       RETURNING system_id, scheduled_date, technician""", (status, cause, note, order_id))
        sid, day, tech = cur.fetchone()
    t = tickets("open").query("work_order_id == @order_id")
    if not t.empty:
        tid = int(t["id"].iloc[0])
        if outcome == "fixed":
            _update(tid, day, f"{tech}: fixed. Cause: {cause}{f'. Note: {note}' if note else ''}. Checking the next days' output.",
                    by="technician", stage="verifying", verify_from=day + timedelta(days=1), resolution=f"cause: {cause}")
        else:
            _update(tid, day, f"{tech}: couldn't fix. {note or 'No note'}. Booking a follow-up visit.", by="technician")
            s = next(x for x in maintenance.fleet() if x["id"] == sid)
            propose_visit(_ticket(tid), s, day, job="repair")
    return {"system_id": sid, "day": str(day), "outcome": outcome}


def technician_jobs(technician):
    """A technician's booked visits, in driving order per day (nearest stop next, from home base)."""
    df = query_df("""
        SELECT w.id, w.system_id, w.scheduled_date, w.status, w.job, w.notes, s.owner_name, s.location, s.phone,
               s.capacity_kw, s.inverter_model, t.fault, t.loss_rs
        FROM work_orders w JOIN systems s ON s.id = w.system_id
        LEFT JOIN tickets t ON t.work_order_id = w.id AND t.status = 'open'
        WHERE w.technician = %s AND w.status = 'scheduled' ORDER BY w.scheduled_date
    """, [technician])
    days = []
    for day, g in df.groupby("scheduled_date", sort=True):
        here, left, stops, total = TECH_BASES[technician], g.to_dict("records"), [], 0.0
        while left:
            nxt = min(left, key=lambda r: km(here, r["location"]))
            d = km(here, nxt["location"])
            total += d
            stops.append({**nxt, "scheduled_date": str(day), "km_from_previous": round(d),
                          "lat": COORDS[nxt["location"]][0], "lon": COORDS[nxt["location"]][1]})
            here = nxt["location"]
            left.remove(nxt)
        days.append({"day": str(day), "stops": stops, "km": round(total), "base": TECH_BASES[technician]})
    return {"technician": technician, "base": TECH_BASES[technician], "days": days, "causes": CAUSES}


# --- Owner responses (email buttons / customer app) ----------------------------------------------

ALLOWED = {"owner": ["done", "book_cleaning", "call_me"], "technician": ["confirm", "another_day"],
           "waiting": ["done", "book_cleaning", "call_me"]}     # first = main button


def ticket_public(token):
    t = tickets().query("token == @token")
    if t.empty:
        return None
    t = t.iloc[0].to_dict()
    return {"id": int(t["id"]), "owner_name": t["owner_name"], "fault": FAULT_NAME[t["fault"]], "stage": t["stage"],
            "status": t["status"], "loss_rs": t["loss_rs"], "owner_response": t["owner_response"],
            "actions": [a for a in ALLOWED.get(t["stage"], []) if a != "book_cleaning" or t["fault"] == "soiling"]}


def respond(token, action):
    df = tickets().query("token == @token")
    if df.empty:
        raise ValueError("Unknown link")
    t = df.iloc[0].to_dict()
    if t["status"] == "closed":
        return {"ok": True, "message": "This is already resolved. Thank you!"}
    if action not in ALLOWED.get(t["stage"], []):
        raise ValueError("That option isn't available any more")
    s = next(x for x in maintenance.fleet() if x["id"] == t["system_id"])
    today = date.fromisoformat(s["as_of"])
    tid = int(t["id"])
    if action == "done":
        _update(tid, today, "Owner tapped Done. Checking the next 3–5 days of output.", by="owner",
                owner_response="done", stage="verifying", verify_from=today + timedelta(days=1))
        msg = "Thanks! We'll check your output over the next few days and let you know."
    elif action == "book_cleaning":
        _update(tid, today, "Owner asked for a cleaning visit.", by="owner", owner_response="book_cleaning")
        propose_visit(t | {"id": tid}, s, today, job="cleaning")
        msg = "Thanks! We'll book a cleaning visit and send you the date."
    elif action == "call_me":
        _update(tid, today, "Owner asked for a call.", by="owner", owner_response="call_me", stage="callback")
        msg = "Thanks! Your installer will call you shortly."
    elif action == "confirm":
        _update(tid, today, "Owner confirmed the visit.", by="owner", owner_response="confirm")
        msg = "Thanks, the visit is confirmed."
    else:                                                       # another_day
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("""UPDATE work_orders SET scheduled_date = scheduled_date + 2, reminded = FALSE
                           WHERE id = %s RETURNING technician, scheduled_date""", (t["work_order_id"],))
            tech, day = cur.fetchone()
        _update(tid, today, f"Owner asked for another day: moved to {day:%d %b}.", by="owner", owner_response="another_day")
        notify_owner(t | {"id": tid}, s, "visit", today, {"left": 1}, {"technician": tech, "scheduled_date": str(day)})
        msg = f"No problem: the visit is moved to {day:%A %d %b}."
    return {"ok": True, "message": msg, "system_id": int(t["system_id"]), "action": action, "fault": t["fault"],
            "day": str(today)}


def send_technician(tid):
    """Installer, after a 'Call me', decides a technician should go."""
    t = _ticket(tid)
    s = next(x for x in maintenance.fleet() if x["id"] == t["system_id"])
    today = date.fromisoformat(s["as_of"])
    _update(tid, today, "Installer called the owner and is sending a technician.", by="installer")
    return {"work_order_id": propose_visit(t, s, today)}


# --- the agent loop ---------------------------------------------------------------------------------

def step():
    fleet = maintenance.fleet()
    fleet_day = date.fromisoformat(pd.Series([s["as_of"] for s in fleet]).mode()[0])
    open_t = {int(r.system_id): r._asdict() for r in tickets("open").itertuples()}
    budget = {"left": REAL_DELIVERY_MAX_PER_RUN}
    actions = []

    for s in fleet:
        today = date.fromisoformat(s["as_of"])
        t = open_t.get(s["id"])
        issue = s["issue"]

        # Stage 1: open a ticket for a persistent fault
        if t is None:
            if not issue or issue["days_open"] < AGENT_PERSIST_DAYS:
                continue
            ignored = query_df("""SELECT COUNT(*) FROM tickets WHERE system_id = %s AND route = 'ignore'
                                  AND fault = %s AND opened_on > %s""",
                               [s["id"], issue["label"], today - timedelta(days=30)]).iloc[0, 0]
            if ignored and issue["rupees_per_month"] < AGENT_IGNORE_BELOW_RS:
                continue
            route, reason = triage(s, today, fleet_day)
            stage = {"wait": "waiting", "owner_action": "owner", "data_fix": "owner",
                     "technician": "technician", "ignore": "closed"}[route]
            tid = _open_ticket(s, route, stage, reason, today,
                               recheck_on=today + timedelta(days=3) if route == "wait" else None)
            t = _ticket(tid)
            actions.append(f"{s['owner_name']}: opened ({route.replace('_', ' ')})")
            if route == "ignore":
                _close(tid, today, "ignored: small loss", "Closed: loss too small to notify.")
                continue
            if route in ("owner_action", "data_fix"):
                r, src = notify_owner(t, s, route, today, budget)
                _update(tid, today, f"Owner sent an SMS{' (AI-written)' if src == 'llm' else ''}"
                                    f"{', delivered' if r['status'] == 'sent' else ''}.", notified_on=today)
            elif route == "technician":
                propose_visit(t, s, today)
            continue

        tid = int(t["id"])
        # Fault gone without anyone acting (e.g. rain) while not already verifying a fix
        if not issue and t["stage"] in ("waiting", "owner"):
            _close(tid, today, "self_resolved", "Output is back to normal on its own (likely rain washed the panels).",
                   label=(s["id"], t["fault"], "Washed by rain", t["opened_on"], today, "rain"))
            actions.append(f"{s['owner_name']}: recovered on its own")
            continue

        if t["stage"] == "waiting" and t["recheck_on"] and today >= date.fromisoformat(str(t["recheck_on"])):
            _update(tid, today, "Rain didn't clean the panels. Asking the owner.", stage="owner", route="owner_action")
            r, src = notify_owner(t, s, "owner_action", today, budget)
            _update(tid, today, "Owner sent an SMS.", notified_on=today)
            actions.append(f"{s['owner_name']}: rain didn't help, owner asked")

        elif t["stage"] == "owner" and t["notified_on"]:
            waited = (today - date.fromisoformat(str(t["notified_on"]))).days
            if waited >= AGENT_REMIND_AFTER_DAYS and t["reminders"] == 0:
                notify_owner(t, s, "reminder", today, budget)
                _update(tid, today, "No reply after 3 days: sent one reminder.", reminders=1)
                actions.append(f"{s['owner_name']}: reminder sent")
            elif waited >= 2 * AGENT_REMIND_AFTER_DAYS and t["reminders"] >= 1:
                if (t["loss_rs"] or 0) >= AGENT_ESCALATE_ABOVE_RS:
                    _update(tid, today, "No reply and the loss is too big to leave: sending a technician.")
                    propose_visit(t, s, today)
                    actions.append(f"{s['owner_name']}: no reply, technician proposed")
                else:
                    _close(tid, today, "unresolved: no reply", "No reply and the loss is small: marked unresolved "
                                                              "(shown in the monthly report).")
                    actions.append(f"{s['owner_name']}: unresolved")

        elif t["stage"] == "verifying" and t["verify_from"]:
            days, pct = recovery(s["id"], t["verify_from"])
            if days >= 3 and pct is not None and pct >= AGENT_RECOVERED_PCT:
                by_tech = (t["resolution"] or "").startswith("cause:")
                cause = (t["resolution"] or "").removeprefix("cause: ") if by_tech else \
                    {"soiling": "Panels cleaned (dust)", "inverter_off": "Inverter tripped (reset)",
                     "data_gap": "Dongle back online"}.get(t["fault"], t["fault"])
                res = f"{'technician' if by_tech else 'owner'}_fixed: {cause}"
                _close(tid, today, res, f"Verified: output back to {pct}% of expected over {days} days. Closed.",
                       label=(s["id"], t["fault"], cause, t["opened_on"], today, "technician" if by_tech else "owner"))
                notify_owner(t, s, "closed_ok", today, budget)
                actions.append(f"{s['owner_name']}: fixed and verified ({pct}%)")
            elif days >= 5:
                again = (t["resolution"] or "").startswith("cause:")
                _update(tid, today, f"Output still only {pct}% after the fix: "
                                    f"{'needs a second visit' if again else 'cause was probably not ' + FAULT_NAME[t['fault']]}. Escalating.",
                        stage="technician", route="technician", resolution=None)
                propose_visit(t, s, today)
                actions.append(f"{s['owner_name']}: no recovery, technician proposed")

        elif t["stage"] == "technician" and t["work_order_id"]:
            o = query_df("SELECT status, technician, scheduled_date, reminded FROM work_orders WHERE id = %s",
                         [int(t["work_order_id"])])
            if not o.empty and o.iloc[0]["status"] == "scheduled" and not o.iloc[0]["reminded"] \
                    and o.iloc[0]["scheduled_date"] - today == timedelta(days=1):
                o = o.iloc[0]
                notify_owner(t, s, "visit_reminder", today, budget, {"technician": o["technician"]})
                maintenance.send_message(s["id"], None, "sms", o["technician"], None,
                                         f"Tomorrow: {s['owner_name']}, {s['location']}. {s['issue']['name'] if s['issue'] else ''}",
                                         "visit_reminder", created_by="agent", real=False, customer=o["technician"])
                with get_conn() as conn, conn.cursor() as cur:
                    cur.execute("UPDATE work_orders SET reminded = TRUE WHERE id = %s", (int(t["work_order_id"]),))
                _update(tid, today, "Reminded the owner and the technician: visit is tomorrow.")
                actions.append(f"{s['owner_name']}: visit reminders sent")

    settings = get_settings()
    settings["last_run"] = pd.Timestamp.now(tz="Asia/Kolkata").isoformat()
    save_settings(settings)
    return {"actions": actions, "delivered": REAL_DELIVERY_MAX_PER_RUN - budget["left"], "settings": settings}


def maybe_step():
    return step() if get_settings().get("enabled") else None


# --- Stage 6: report ----------------------------------------------------------------------------------

def summary():
    t = tickets()
    closed = t[t["status"] == "closed"]
    fixed = closed[closed["resolution"].fillna("").str.contains("fixed|self_resolved")]
    owner_closed = closed[closed["route"].isin(["owner_action", "data_fix"]) | closed["owner_response"].notna()]
    orders = query_df("""SELECT w.id, w.status, w.scheduled_date, w.technician, w.job, s.location,
                                (t.opened_on <= s.warranty_until) AS covered, t.loss_rs
                         FROM work_orders w JOIN systems s ON s.id = w.system_id
                         LEFT JOIN tickets t ON t.work_order_id = w.id AND t.status = 'open'
                         WHERE w.status IN ('proposed', 'scheduled')""")
    proposed = orders[orders["status"] == "proposed"]
    stages = t[t["status"] == "open"]["stage"].value_counts().to_dict()
    return {
        "open": int((t["status"] == "open").sum()),
        "stages": {k: int(v) for k, v in stages.items()},
        "closed": int(len(closed)),
        "fixed": int(len(fixed)),
        "owner_fixed": int(closed["resolution"].fillna("").str.startswith("owner_fixed").sum()),
        "owner_fix_rate": round(100 * closed["resolution"].fillna("").str.startswith("owner_fixed").sum()
                                / max(1, len(owner_closed))),
        "recovered_rs": int(fixed["loss_rs"].fillna(0).sum()),
        "unresolved": int(closed["resolution"].fillna("").str.startswith("unresolved").sum()),
        "ignored": int(closed["resolution"].fillna("").str.startswith("ignored").sum()),
        "proposed": {"jobs": int(len(proposed)), "warranty": int((proposed["covered"] == True).sum()),  # noqa: E712
                     "recover_rs": int(proposed["loss_rs"].fillna(0).sum())},
        "confirmed_labels": int(query_df("SELECT COUNT(*) FROM confirmed_labels").iloc[0, 0]),
        "llm": llm.available(),
    }
