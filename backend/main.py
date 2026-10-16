from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from db import db_status, query_df
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
