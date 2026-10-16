"""Open-Meteo daily sunlight + rain for each location -> weather table.

Run `python weather.py` to fetch (or read from cache) and load all locations.
"""
import json
import time

import requests

from config import END_DATE, START_DATE, WEATHER_CACHE
from db import insert_many, query_df
from locations import LOCATIONS

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
MJ_TO_KWH = 1 / 3.6


def fetch_daily(name, lat, lon, start=START_DATE, end=END_DATE):
    """Daily weather for one location, cached on disk so the demo works offline."""
    cache_file = WEATHER_CACHE / f"{name}_{start}_{end}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text())

    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start,
        "end_date": end,
        "daily": "shortwave_radiation_sum,precipitation_sum",
        "timezone": "Asia/Kolkata",
    }
    for attempt in range(5):
        try:
            res = requests.get(ARCHIVE_URL, params=params, timeout=60)
            res.raise_for_status()
            break
        except requests.RequestException as e:
            if attempt == 4:
                raise
            print(f"  {name}: retry {attempt + 1} ({e})")
            time.sleep(3)

    data = res.json()["daily"]
    WEATHER_CACHE.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(data))
    return data


def to_rows(name, daily):
    rows = []
    for day, mj, rain in zip(daily["time"], daily["shortwave_radiation_sum"], daily["precipitation_sum"]):
        if mj is None:
            continue
        rows.append((f"{day} 00:00+05:30", name, round(mj * MJ_TO_KWH, 3), rain or 0.0))
    return rows


def load_all():
    for name, _district, lat, lon in LOCATIONS:
        rows = to_rows(name, fetch_daily(name, lat, lon))
        insert_many(
            "weather",
            ["time", "location", "sunlight_kwh_m2", "rain_mm"],
            rows,
            conflict="(location, time) DO UPDATE SET sunlight_kwh_m2 = EXCLUDED.sunlight_kwh_m2, rain_mm = EXCLUDED.rain_mm",
        )
        print(f"  {name}: {len(rows)} days")


def get_weather(location, start=None, end=None):
    sql = "SELECT time::date AS day, sunlight_kwh_m2, rain_mm FROM weather WHERE location = %s"
    params = [location]
    if start:
        sql += " AND time >= %s"
        params.append(start)
    if end:
        sql += " AND time <= %s"
        params.append(end)
    return query_df(sql + " ORDER BY time", params)


def summary():
    return query_df("""
        SELECT location,
               COUNT(*)                        AS days,
               ROUND(AVG(sunlight_kwh_m2)::numeric, 2) AS avg_sun_kwh_m2,
               ROUND(SUM(sunlight_kwh_m2)::numeric, 0) AS yearly_sun_kwh_m2,
               ROUND(SUM(rain_mm)::numeric, 0)         AS yearly_rain_mm
        FROM weather
        GROUP BY location
        ORDER BY location
    """)


if __name__ == "__main__":
    print(f"Loading weather {START_DATE} -> {END_DATE}")
    load_all()
    print(summary().to_string(index=False))
