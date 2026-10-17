"""Demo clock: move the simulated fleet forward N days so the agent can verify fixes.

The demo fleet ends on 31 Dec 2025. advance(n) generates the next n days for every simulated
roof from REAL Open-Meteo weather for those dates, applying what has happened in the demo world:
  - active faults continue (fault_labels with no end_date)
  - heavy rain (>= 10 mm) washes dust off
  - owner fixes and technician repairs (on_owner_action / on_visit_done) end the fault
Then detection re-runs (health -> features -> model -> alerts) and the agent takes its next step.

The agent never reads fault_labels: it only sees generation data, like in real life.
"""
from datetime import timedelta

import numpy as np
import pandas as pd

from config import PERFORMANCE_RATIO
from db import get_conn, insert_many, query_df
from locations import LOCATIONS


def _end_faults(system_id, day, faults):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""UPDATE fault_labels SET end_date = %s
                       WHERE system_id = %s AND end_date IS NULL AND fault = ANY(%s)""",
                    (day, system_id, list(faults)))


def on_owner_action(result):
    """What physically happens when an owner taps Done (demo world)."""
    if result.get("action") != "done":
        return
    sid, fault, day = result["system_id"], result["fault"], result["day"]
    if fault == "soiling":
        _end_faults(sid, day, ["soiling"])                         # they cleaned the panels
    elif fault == "inverter_off" and sid % 3 != 0:
        _end_faults(sid, day, ["inverter_off"])                    # ~2 in 3 trips clear with a restart


def on_visit_done(result):
    """Technician visit fixes whatever was wrong on that roof."""
    _end_faults(result["system_id"], result["day"], ["string_failure", "inverter_off", "soiling"])


def advance(days=3):
    from expected import compute_health
    from predict import run as run_predictions
    from weather import load_range

    sys = query_df("""SELECT s.id, s.location, s.capacity_kw, s.baseline FROM systems s
                      WHERE s.source = 'simulated' ORDER BY s.id""")
    last = query_df("""SELECT MAX(r.time)::date FROM readings r JOIN systems s ON s.id = r.system_id
                       WHERE s.source = 'simulated'""").iloc[0, 0]
    first, end = last + timedelta(days=1), last + timedelta(days=days)

    for name, _d, lat, lon in LOCATIONS:
        load_range(name, lat, lon, str(first), str(end))
    weather = query_df("""SELECT time::date AS day, location, sunlight_kwh_m2, rain_mm FROM weather
                          WHERE time::date BETWEEN %s AND %s""", [first, end])
    if weather.empty:
        raise RuntimeError("No weather available for those dates yet")

    rng = np.random.default_rng(int(pd.Timestamp(first).strftime("%Y%m%d")))
    rows = []
    for d in pd.date_range(first, end).date:
        w_day = weather[weather["day"] == d].set_index("location")
        # Heavy rain washes dust off before the day's generation
        for loc in w_day.index[w_day["rain_mm"] >= 10]:
            with get_conn() as conn, conn.cursor() as cur:
                cur.execute("""UPDATE fault_labels SET end_date = %s WHERE fault = 'soiling' AND end_date IS NULL
                               AND system_id IN (SELECT id FROM systems WHERE location = %s)""", (d, loc))
        active = query_df("""SELECT system_id, fault, severity FROM fault_labels
                             WHERE end_date IS NULL AND fault <> 'weather_dip'""")
        factor = {}
        for a in active.itertuples():
            f = 0.0 if a.fault == "inverter_off" else 1 - float(a.severity or 0)
            factor[a.system_id] = factor.get(a.system_id, 1.0) * f
        for s in sys.itertuples():
            if s.location not in w_day.index:
                continue
            sun, rain = w_day.loc[s.location, "sunlight_kwh_m2"], w_day.loc[s.location, "rain_mm"]
            noise = rng.normal(1.0, 0.04 + 0.06 * (rain > 10))
            kwh = s.capacity_kw * sun * PERFORMANCE_RATIO * (s.baseline or 1) * noise * factor.get(s.id, 1.0)
            rows.append((f"{d} 00:00+05:30", int(s.id), round(max(float(kwh), 0.0), 2)))

    insert_many("readings", ["time", "system_id", "kwh"], rows)
    ids = [int(i) for i in sys["id"]]
    compute_health(ids)
    run_predictions()
    return {"from": str(first), "to": str(end), "readings": len(rows)}
