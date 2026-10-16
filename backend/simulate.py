"""Synthetic fleet: systems + daily readings built on real Open-Meteo weather.

Run `python simulate.py` to (re)generate the whole fleet.

actual_kwh = capacity × sunlight × system_pr × local_weather × daily_noise
  system_pr      each roof's own efficiency (wiring, tilt, orientation)
  local_weather  multi-day dips the satellite grid misses (same for every
                 system at a location — the peer check learns from these)
  daily_noise    day-to-day mismatch, bigger on rainy days
Faults are injected on top in hour 4.
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
                                        warranty_until, installer_id, source)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, 'simulated') RETURNING id""",
                ("", s["owner_name"], s["location"], s["capacity_kw"], s["install_date"],
                 s["warranty_until"], installer_id),
            )
            s["id"] = cur.fetchone()[0]
            s["name"] = f"SYS-{s['id']:03d}"
            cur.execute("UPDATE systems SET name = %s WHERE id = %s", (s["name"], s["id"]))


def simulate_readings(rng, systems, weather, local_weather):
    rows = []
    for s in systems:
        w = weather[weather["location"] == s["location"]]
        sun = w["sunlight_kwh_m2"].to_numpy()
        rain = w["rain_mm"].to_numpy()

        system_pr = PERFORMANCE_RATIO * rng.normal(1.0, 0.04)
        noise = rng.normal(1.0, 0.04 + 0.06 * (rain > 10), size=len(sun))
        kwh = s["capacity_kw"] * sun * system_pr * local_weather[s["location"]] * noise
        kwh = np.clip(kwh, 0, None)

        rows += [(f"{d} 00:00+05:30", s["id"], round(float(k), 2)) for d, k in zip(w["day"], kwh)]
        s["system_pr"] = system_pr
    return rows


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
    readings = simulate_readings(rng, systems, weather, local_weather)
    insert_many("readings", ["time", "system_id", "kwh"], readings)

    # Weather dips are labelled per affected system (ground truth for training)
    labels = [
        (s["id"], start, end, "weather_dip", depth)
        for s in systems
        for loc, start, end, depth in events
        if loc == s["location"]
    ]
    insert_many("fault_labels", ["system_id", "start_date", "end_date", "fault", "severity"], labels)

    print(f"{len(systems)} systems, {len(readings)} readings, {len(events)} local weather dips")
    return systems


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
