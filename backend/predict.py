"""Classify every system-day, then turn persistent faults into alerts.

Run `python predict.py`.

Daily predictions -> health.label / health.confidence (for charts)
Alerts only when the same fault persists (no single-day alarms):
  - day counts only if the model is >= 50% sure
  - same-fault runs with gaps <= 3 days are merged
  - run must last MIN_DAYS before we alert
"""
import json
from datetime import date

import numpy as np
from psycopg2.extras import execute_values

from config import TARIFF_RS_PER_UNIT
from db import get_conn, insert_many, query_df
from features import CLASSES, FEATURES, HEAVY_RAIN_MM, build_features
from train import load_model

MIN_CONFIDENCE = 0.5
RECOVERED_DAYS = 3        # a fault only ends after this many recovered days
RECOVERED_VS_PEERS = -0.08  # recovered = back within 8% of the neighbours
MIN_SOILING_LOSS = 0.05    # dust alerts only when it costs at least 5%
MIN_DAYS = {"inverter_off": 3, "string_failure": 5, "soiling": 7}

ACTIONS = {
    "string_failure": ("technician", "Send a technician to check strings, connectors and fuses"),
    "inverter_off": ("technician", "Check the inverter: tripped breaker, error code or power supply"),
    "soiling": ("homeowner", "Clean the panels with plain water early morning"),
}


def fmt(d):
    return d.strftime("%d %b %Y").lstrip("0")


# --- Daily predictions ------------------------------------------------------

def predict_days(system_ids=None):
    df = build_features(system_ids)
    model = load_model()
    proba = model.predict_proba(df[FEATURES])
    classes = list(model.classes_)
    df["pred"] = [classes[i] for i in proba.argmax(axis=1)]
    df["confidence"] = proba.max(axis=1)
    for c in CLASSES:
        df[f"p_{c}"] = proba[:, classes.index(c)] if c in classes else 0.0
    return df


def save_daily(df):
    rows = [(d.strftime("%Y-%m-%d"), int(s), p, round(float(c), 3))
            for d, s, p, c in zip(df["day"], df["system_id"], df["pred"], df["confidence"])]
    with get_conn() as conn, conn.cursor() as cur:
        execute_values(cur, """
            UPDATE health h SET label = v.label, confidence = v.conf
            FROM (VALUES %s) AS v(day, system_id, label, conf)
            WHERE h.system_id = v.system_id AND h.time = (v.day || ' 00:00+05:30')::timestamptz
        """, rows, page_size=5000)


# --- Runs -> alerts ---------------------------------------------------------

def find_runs(sys_df):
    """[(label, start_idx, end_idx)] of persistent faults for one system.
    Same-fault runs are merged unless the roof actually recovered (back within 8%
    of its neighbours) for RECOVERED_DAYS days in between, so a brief wrong
    guess by the model doesn't split one fault into several alerts."""
    fault = np.where(
        sys_df["pred"].isin(MIN_DAYS.keys()) & (sys_df["confidence"] >= MIN_CONFIDENCE),
        sys_df["pred"], None,
    )
    healthy = (sys_df["vs_peers_7"] > RECOVERED_VS_PEERS).to_numpy()
    runs, last = [], {}
    for i, lab in enumerate(fault):
        if lab is None:
            continue
        run = last.get(lab)
        if run and healthy[run[2] + 1:i].sum() < RECOVERED_DAYS:
            run[2] = i
        else:
            last[lab] = [lab, i, i]
            runs.append(last[lab])
    runs = [r for r in runs if r[2] - r[1] + 1 >= MIN_DAYS[r[0]]]
    # A short different guess inside a longer fault is noise, not a second fault
    return [
        (lab, a, b) for lab, a, b in runs
        if not any(o[0] != lab and o[1] <= a and b <= o[2] for o in runs)
    ]


def estimate_onset(sys_df, label, start):
    """Day the fault actually began (the model needs a few days to be sure)."""
    ratio = sys_df["ratio"].to_numpy()
    days = sys_df["day"].to_numpy()
    if label == "soiling":
        # Dust has been building since the day after the last heavy rain
        rain = sys_df["rain_mm"].to_numpy()
        i = start
        while i > 0 and rain[i] < HEAVY_RAIN_MM:
            i -= 1
        return days[min(i + 1, start)]
    before = np.median(ratio[max(0, start - 30):max(1, start - 10)])
    after = np.median(ratio[start:start + 7])
    mid = (before + after) / 2
    for i in range(max(0, start - 10), start + 1):
        if ratio[i:i + 3].mean() < mid:
            return days[i]
    return days[start]


def reasons_for(label, r, run_df, onset, end):
    own, peer = r.rolling_mean_7, r.peer_median_7
    if r.peer_count == 0:
        neighbours = (f"Compared with satellite sunlight for your area: this roof is at {own:.0%} of expected "
                      f"(no neighbouring systems on record yet)")
    elif peer >= 0.9:
        neighbours = f"Neighbours normal: {int(r.peer_count)} nearby systems are at {peer:.0%} of expected, this roof is at {own:.0%}"
    else:
        neighbours = (f"Neighbours are also low ({peer:.0%}, local weather), "
                      f"but this roof is {abs(r.vs_peers_7):.0%} below them")
    heavy_rain_days = int((run_df["rain_mm"] >= HEAVY_RAIN_MM).sum())
    max_rain = run_df["rain_mm"].max()

    if label == "string_failure":
        reasons = [f"Sudden step down around {fmt(onset)}" + ("" if end else " that has not recovered"), neighbours]
        if heavy_rain_days:
            reasons.append(f"Stayed low through {heavy_rain_days} heavy-rain days (up to {max_rain:.0f} mm), so it is not dust")
        else:
            reasons.append(f"Drop of about {abs(r.vs_peers_7):.0%} matches one panel string going offline")
    elif label == "inverter_off":
        reasons = [
            f"{int(r.zero_days_7)} of the last 7 days produced nothing despite {r.sunlight_kwh_m2:.1f} kWh/m² of sunlight",
            f"Started abruptly on {fmt(onset)}",
            neighbours,
        ]
    else:
        reasons = [
            f"Slow steady decline: {abs(r.change_vs_30):.0%} lower than the previous month",
            f"{int(r.days_since_heavy_rain)} days since the last heavy rain, dust builds up in dry weather",
            neighbours,
        ]
    return reasons


def message_for(label, system, onset, end, loss, weather, fault, rupees, has_peers=True):
    warranty = system["warranty_until"]
    weather_txt = (f"Local weather explains {weather:.0%}. The remaining {fault:.0%}" if has_peers
                   else f"Satellite sunlight for your area is already accounted for. The {fault:.0%} drop")
    if label == "soiling":
        msg = (f"Output has slowly fallen {loss:.0%} below expected since {fmt(onset)}. "
               f"{weather_txt} looks like dust on the panels. "
               f"Cleaning should recover about ₹{rupees:,.0f} a month.")
    else:
        what = ("one panel string offline" if label == "string_failure" else "the inverter not producing")
        msg = (f"Generation dropped {loss:.0%} from {fmt(onset)}. {weather_txt} "
               f"is consistent with {what}. Costing about ₹{rupees:,.0f} a month.")
        if warranty:
            msg += (f" Covered under workmanship warranty until {fmt(warranty)}." if onset <= warranty
                    else f" Workmanship warranty ended {fmt(warranty)}.")
    if end:
        msg += f" Resolved on {fmt(end)}."
    return msg


def build_alerts(df):
    systems = query_df("SELECT id, warranty_until FROM systems").set_index("id").to_dict("index")
    alerts = []
    for sid, sys_df in df.groupby("system_id"):
        sys_df = sys_df.reset_index(drop=True)
        last_day = sys_df["day"].max()                     # each system's own "today"
        for label, a, b in find_runs(sys_df):
            run_df = sys_df.iloc[a:b + 1]
            r = sys_df.iloc[b]                                  # latest state of this fault
            onset = estimate_onset(sys_df, label, a).astype("datetime64[D]").item()
            detected = sys_df["day"].iloc[a + MIN_DAYS[label] - 1].date()
            end = None if sys_df["day"].iloc[b] == last_day else sys_df["day"].iloc[b].date()

            loss = max(0.0, 1 - r.rolling_mean_7)
            weather = min(loss, max(0.0, 1 - r.peer_median_7))
            fault = loss - weather
            if label == "soiling" and fault < MIN_SOILING_LOSS:
                continue                                    # not worth the homeowner's time
            expected_month = sys_df["expected_kwh"].iloc[max(0, b - 29):b + 1].mean() * 30
            rupees = fault * expected_month * TARIFF_RS_PER_UNIT
            audience, action = ACTIONS[label]

            alerts.append((
                int(sid), onset, detected, end, label,
                round(float(run_df[f"p_{label}"].mean()), 3),
                round(loss, 3), round(weather, 3), round(fault, 3), round(rupees, 0),
                audience, action,
                message_for(label, systems[sid], onset, end, loss, weather, fault, rupees, r.peer_count > 0),
                json.dumps(reasons_for(label, r, run_df, onset, end)),
                "open" if end is None else "resolved",
            ))
    return alerts


def run(system_ids=None):
    df = predict_days(system_ids)
    save_daily(df)
    alerts = build_alerts(df)
    ids = [int(i) for i in df["system_id"].unique()]
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM alerts WHERE system_id = ANY(%s)", (ids,))
    insert_many("alerts", [
        "system_id", "start_date", "detected_date", "end_date", "label", "confidence",
        "loss_pct", "weather_pct", "fault_pct", "rupees_per_month", "audience", "action",
        "message", "reasons", "status",
    ], alerts)
    return len(df), len(alerts)


def get_alerts(system_id=None, status=None):
    sql = """
        SELECT a.id, a.system_id, s.name, s.owner_name, s.location, a.label,
               a.start_date::text, a.detected_date::text, a.end_date::text, a.confidence,
               a.loss_pct, a.weather_pct, a.fault_pct, a.rupees_per_month,
               a.audience, a.action, a.message, a.reasons, a.status
        FROM alerts a JOIN systems s ON s.id = a.system_id WHERE TRUE
    """
    params = []
    if system_id is not None:
        sql += " AND a.system_id = %s"
        params.append(system_id)
    if status:
        sql += " AND a.status = %s"
        params.append(status)
    return query_df(sql + " ORDER BY a.status, a.rupees_per_month DESC, a.start_date DESC", params)


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")     # Windows console + ₹
    days, n = run()
    print(f"Classified {days} system-days, created {n} alerts\n")
    print(query_df("""
        SELECT label, status, COUNT(*) AS alerts, ROUND(AVG(confidence)::numeric, 2) AS avg_conf
        FROM alerts GROUP BY 1, 2 ORDER BY 1, 2
    """).to_string(index=False))
    open_tech = query_df("SELECT COUNT(DISTINCT system_id) FROM alerts WHERE status='open' AND audience='technician'").iloc[0, 0]
    total = query_df("SELECT COUNT(*) FROM systems").iloc[0, 0]
    print(f"\n{open_tech} of {total} systems need a technician visit\n")
    hero = get_alerts(1)
    for a in hero.itertuples():
        print(f"[{a.status}] {a.name} {a.label} ({a.confidence:.0%})\n  {a.message}")
        for reason in a.reasons:
            print(f"   - {reason}")
