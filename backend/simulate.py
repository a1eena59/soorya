"""Synthetic fleet: systems + daily readings built on real Open-Meteo weather.

Run `python simulate.py` to (re)generate the whole fleet.

actual_kwh = capacity × sunlight × system_pr × local_weather × daily_noise
  system_pr      each roof's own efficiency (wiring, tilt, orientation)
  local_weather  multi-day dips the satellite grid misses (same for every
                 system at a location — the peer check learns from these)
  daily_noise    day-to-day mismatch, bigger on rainy days
  × fault        soiling      slow decline, washed off by >=10 mm rain
                 string       sudden step down (25/33/50%), sometimes repaired
                 inverter_off zero output for days, usually repaired
Every fault episode is written to fault_labels as ground truth.
"""
from datetime import date, timedelta

import numpy as np
import pandas as pd

from config import END_DATE, PERFORMANCE_RATIO, START_DATE
from db import get_conn, insert_many, query_df
from locations import LOCATIONS

SEED = 42
N_SYSTEMS = 100
INSTALLER = "Sunrise Solar Energy, Kochi"

# More systems near the installer's base
LOCATION_WEIGHTS = {"Kochi": 4, "Thrissur": 3, "Kottayam": 2, "Alappuzha": 2, "Kozhikode": 2}
CAPACITIES = [2, 3, 3, 3, 4, 4, 5, 5, 6, 8]
INVERTERS = ["Growatt MIN {kw}000TL-X", "Solis S6-GR1P{kw}K", "Deye SUN-{kw}K-G04"]
SURNAMES = [
    "Nair", "Menon", "Pillai", "Thomas", "Joseph", "Varghese", "Kurian", "Abraham", "Rahman",
    "Krishnan", "Das", "Mathew", "George", "Iyer", "Warrier", "Koshy", "Philip", "Ali", "Panicker",
    "Chacko", "Kutty", "Haneefa", "Raghavan", "Unnikrishnan", "Sebastian", "Francis", "Basheer",
]

# Demo hero system: always id 1
HERO = {"owner_name": "Nair residence", "location": "Kochi", "capacity_kw": 3.0}


def make_systems(rng):
    names = [loc[0] for loc in LOCATIONS]
    weights = np.array([LOCATION_WEIGHTS.get(n, 1) for n in names], dtype=float)
    # At least 3 systems per location so every roof has peers; the rest weighted
    rest = rng.choice(names, size=N_SYSTEMS - 1 - 3 * len(names), p=weights / weights.sum())
    locations = np.concatenate([names * 3, rest])
    rng.shuffle(locations)
    locations = np.concatenate([[HERO["location"]], locations])

    systems = []
    for i in range(N_SYSTEMS):
        install = date(2023, 6, 1) + timedelta(days=int(rng.integers(0, 540)))
        system = {
            "owner_name": f"{rng.choice(SURNAMES)} residence",
            "location": str(locations[i]),
            "capacity_kw": float(rng.choice(CAPACITIES)),
            "install_date": install,
            "warranty_until": install + timedelta(days=5 * 365 + 1),   # 5-year workmanship warranty
            "inverter_brand": i % len(INVERTERS),             # not random: keeps the fleet identical
        }
        if i == 0:
            system.update(HERO)
        systems.append(system)
    return systems


def make_local_weather(rng, days):
    """Per-location multiplier: 1.0 normally, 0.65–0.85 during local cloud spells."""
    factors, events = {}, []
    for name, *_ in LOCATIONS:
        f = np.ones(len(days))
        for _ in range(int(rng.integers(3, 6))):
            # Mostly monsoon (Jun–Nov), sometimes any time
            month = int(rng.choice([6, 7, 8, 9, 10, 11])) if rng.random() < 0.8 else int(rng.integers(1, 13))
            start = date(days[0].year, month, int(rng.integers(1, 25)))
            length = int(rng.integers(4, 13))
            depth = float(rng.uniform(0.65, 0.85))
            mask = (days >= pd.Timestamp(start)) & (days < pd.Timestamp(start + timedelta(days=length)))
            f[mask] = np.minimum(f[mask], depth)
            events.append((name, start, start + timedelta(days=length - 1), round(1 - depth, 3)))
        factors[name] = f
    return factors, events


def reset_fleet():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM systems WHERE source = 'simulated'")   # cascades to readings, labels
        cur.execute("DELETE FROM installers WHERE name = %s", (INSTALLER,))
        cur.execute("INSERT INTO installers (name) VALUES (%s) RETURNING id", (INSTALLER,))
        installer_id = cur.fetchone()[0]
        cur.execute("SELECT setval('systems_id_seq', COALESCE((SELECT MAX(id) FROM systems), 0) + 1, false)")
    return installer_id


def insert_systems(systems, installer_id):
    with get_conn() as conn, conn.cursor() as cur:
        for s in systems:
            cur.execute(
                """INSERT INTO systems (name, owner_name, location, capacity_kw, install_date,
                                        warranty_until, installer_id, source, inverter_model)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, 'simulated', %s) RETURNING id""",
                ("", s["owner_name"], s["location"], s["capacity_kw"], s["install_date"],
                 s["warranty_until"], installer_id,
                 INVERTERS[s["inverter_brand"]].format(kw=int(s["capacity_kw"]))),
            )
            s["id"] = cur.fetchone()[0]
            s["name"] = f"SYS-{s['id']:03d}"
            cur.execute("UPDATE systems SET name = %s WHERE id = %s", (s["name"], s["id"]))


# --- Faults -----------------------------------------------------------------
# Each returns (multiplier per day, [(start_idx, end_idx_or_None, severity), ...])

def soiling(rain, rate):
    """Dust builds up a little every dry day; a heavy rain (>=10 mm) washes it off."""
    f = np.ones(len(rain))
    level = 1.0
    for i, r in enumerate(rain):
        level = 1.0 if r >= 10 else max(level - rate, 0.7)
        f[i] = level
    # Label stretches where dust costs more than 7%
    episodes, start = [], None
    for i, v in enumerate(f):
        if v < 0.93 and start is None:
            start = i
        elif v >= 0.93 and start is not None:
            episodes.append((start, i - 1, round(float(1 - f[start:i].min()), 3)))
            start = None
    if start is not None:
        episodes.append((start, None, round(float(1 - f[start:].min()), 3)))
    return f, episodes


def step_fault(n_days, start, length, severity):
    """Output falls by `severity` from `start`; repaired after `length` days (None = never)."""
    f = np.ones(n_days)
    end = None if length is None or start + length - 1 >= n_days - 1 else start + length - 1
    f[start:(n_days if end is None else end + 1)] = 1 - severity
    return f, [(start, end, severity)]


def plan_faults(rng, systems, days):
    """Decide which systems get which faults. Hero is reserved for the demo story."""
    n = len(days)
    others = [s for s in systems if s["id"] != systems[0]["id"]]
    picks = rng.permutation(len(others))
    string_sys = [others[i] for i in picks[:14]]
    inverter_sys = [others[i] for i in picks[14:22]]
    dusty_sys = [others[i] for i in rng.choice(len(others), size=25, replace=False)]

    plan = {s["id"]: {"dust_rate": 0.0005, "steps": []} for s in systems}
    for s in dusty_sys:
        plan[s["id"]]["dust_rate"] = float(rng.uniform(0.003, 0.008))   # near a road / construction
    for s in string_sys:
        start = int(rng.integers(30, n - 20))
        severity = float(rng.choice([0.25, 0.33, 0.5]))                # 1 of 4 / 3 / 2 strings
        length = None if rng.random() < 0.5 else int(rng.integers(20, 80))
        plan[s["id"]]["steps"].append(("string_failure", start, length, severity))
    for s in inverter_sys:
        start = int(rng.integers(10, n - 5))
        length = int(rng.integers(3, 16)) if rng.random() < 0.75 else None
        plan[s["id"]]["steps"].append(("inverter_off", start, length, 1.0))

    # Demo story: Nair residence loses 1 of 4 strings on 14 June, never fixed
    hero_start = int(np.where(days == pd.Timestamp("2025-06-14"))[0][0])
    plan[systems[0]["id"]]["steps"].append(("string_failure", hero_start, None, 0.25))
    return plan


def simulate_readings(rng, systems, weather, local_weather, plan, days):
    rows, labels = [], []
    for s in systems:
        w = weather[weather["location"] == s["location"]]
        sun = w["sunlight_kwh_m2"].to_numpy()
        rain = w["rain_mm"].to_numpy()

        system_pr = PERFORMANCE_RATIO * rng.normal(1.0, 0.04)
        noise = rng.normal(1.0, 0.04 + 0.06 * (rain > 10), size=len(sun))

        fault_f, episodes = soiling(rain, plan[s["id"]]["dust_rate"])
        found = [("soiling", *e) for e in episodes]
        for fault, start, length, severity in plan[s["id"]]["steps"]:
            f, eps = step_fault(len(sun), start, length, severity)
            fault_f = fault_f * f
            found += [(fault, *e) for e in eps]

        kwh = s["capacity_kw"] * sun * system_pr * local_weather[s["location"]] * noise * fault_f
        kwh = np.clip(kwh, 0, None)

        rows += [(f"{d} 00:00+05:30", s["id"], round(float(k), 2)) for d, k in zip(w["day"], kwh)]
        labels += [
            (s["id"], days[a].date(), None if b is None else days[b].date(), fault, sev)
            for fault, a, b, sev in found
        ]
        s["system_pr"] = system_pr
    return rows, labels


def run():
    rng = np.random.default_rng(SEED)

    weather = query_df(
        "SELECT time::date AS day, location, sunlight_kwh_m2, rain_mm FROM weather "
        "WHERE time BETWEEN %s AND %s ORDER BY location, time",
        [START_DATE, END_DATE],
    )
    days = pd.to_datetime(sorted(weather["day"].unique()))

    installer_id = reset_fleet()
    systems = make_systems(rng)
    insert_systems(systems, installer_id)

    local_weather, events = make_local_weather(rng, days)
    plan = plan_faults(rng, systems, days)
    readings, labels = simulate_readings(rng, systems, weather, local_weather, plan, days)
    insert_many("readings", ["time", "system_id", "kwh"], readings)

    # Weather dips are labelled per affected system (ground truth for training)
    labels += [
        (s["id"], start, end, "weather_dip", depth)
        for s in systems
        for loc, start, end, depth in events
        if loc == s["location"]
    ]
    insert_many("fault_labels", ["system_id", "start_date", "end_date", "fault", "severity"], labels)

    print(f"{len(systems)} systems, {len(readings)} readings, {len(events)} local weather dips")
    return systems


def label_summary():
    return query_df("""
        SELECT fault,
               COUNT(*)                                  AS episodes,
               COUNT(DISTINCT system_id)                 AS systems,
               COUNT(*) FILTER (WHERE end_date IS NULL)  AS still_active,
               ROUND(AVG(severity)::numeric, 2)          AS avg_loss
        FROM fault_labels GROUP BY fault ORDER BY fault
    """)


def fleet_summary():
    return query_df("""
        SELECT s.location,
               COUNT(*)                                       AS systems,
               SUM(s.capacity_kw)                             AS total_kw,
               ROUND(AVG(y.kwh / s.capacity_kw)::numeric, 0)  AS kwh_per_kw_year
        FROM systems s
        JOIN (SELECT system_id, SUM(kwh) AS kwh FROM readings GROUP BY system_id) y ON y.system_id = s.id
        GROUP BY s.location ORDER BY systems DESC
    """)


if __name__ == "__main__":
    run()
    print(fleet_summary().to_string(index=False))
    print()
    print(label_summary().to_string(index=False))
