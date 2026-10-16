"""Expected kWh, health ratio and 7-day rolling mean -> health table.

Run `python expected.py` to recompute health for every system.

expected_kwh = capacity × sunlight × PERFORMANCE_RATIO × baseline
  baseline   this roof's own median actual/expected over its first 30 days,
             so a roof that is naturally 5% better or worse reads as 1.00 when healthy
ratio      = actual / expected        (1.00 = producing what the sun allowed)
rolling_7  = 7-day mean of ratio      (computed in SQL with a window function)
"""
from config import PERFORMANCE_RATIO
from db import get_conn, insert_many, query_df

CALIBRATION_DAYS = 30


def load_daily(system_ids=None):
    """Daily kWh per system joined with that day's weather.
    time_bucket makes this work for both daily and hourly (CSV) readings."""
    sql = """
        SELECT d.day, d.system_id, d.kwh, s.capacity_kw, w.sunlight_kwh_m2
        FROM (SELECT time_bucket('1 day', time, 'Asia/Kolkata') AS day, system_id, SUM(kwh) AS kwh
              FROM readings GROUP BY 1, 2) d
        JOIN systems s ON s.id = d.system_id
        JOIN weather w ON w.location = s.location AND w.time = d.day
    """
    params = None
    if system_ids:
        sql += " WHERE d.system_id = ANY(%s)"
        params = [list(system_ids)]
    return query_df(sql + " ORDER BY d.system_id, d.day", params)


def compute_health(system_ids=None):
    df = load_daily(system_ids)
    df["expected_raw"] = df["capacity_kw"] * df["sunlight_kwh_m2"] * PERFORMANCE_RATIO

    # Commissioning baseline from the first 30 days (zero days excluded)
    first = df.groupby("system_id").head(CALIBRATION_DAYS)
    first = first[first["kwh"] > 0]
    baseline = (first["kwh"] / first["expected_raw"]).groupby(first["system_id"]).median().clip(0.8, 1.2)

    df["expected_kwh"] = df["expected_raw"] * df["system_id"].map(baseline)
    df["ratio"] = df["kwh"] / df["expected_kwh"]

    ids = [int(i) for i in df["system_id"].unique()]
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM health WHERE system_id = ANY(%s)", (ids,))
        for sid, b in baseline.items():
            cur.execute("UPDATE systems SET baseline = %s WHERE id = %s", (round(float(b), 4), int(sid)))

    insert_many(
        "health",
        ["time", "system_id", "expected_kwh", "actual_kwh", "ratio"],
        [
            (r.day, int(r.system_id), round(r.expected_kwh, 3), round(r.kwh, 3), round(r.ratio, 4))
            for r in df.itertuples()
        ],
    )

    # 7-day rolling mean, done by Postgres
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            UPDATE health h SET rolling_7 = r.rolling_7
            FROM (SELECT system_id, time,
                         AVG(ratio) OVER (PARTITION BY system_id ORDER BY time
                                          ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS rolling_7
                  FROM health WHERE system_id = ANY(%s)) r
            WHERE h.system_id = r.system_id AND h.time = r.time
        """, (ids,))
    return len(df)


def get_health(system_id, start=None, end=None):
    sql = """
        SELECT h.time::date::text AS day, h.expected_kwh, h.actual_kwh, h.ratio, h.rolling_7,
               h.label, h.confidence, w.sunlight_kwh_m2, w.rain_mm
        FROM health h
        JOIN systems s ON s.id = h.system_id
        LEFT JOIN weather w ON w.location = s.location AND w.time = h.time
        WHERE h.system_id = %s
    """
    params = [system_id]
    if start:
        sql += " AND h.time >= %s"
        params.append(start)
    if end:
        sql += " AND h.time <= %s"
        params.append(end)
    return query_df(sql + " ORDER BY h.time", params)


if __name__ == "__main__":
    n = compute_health()
    print(f"health rows: {n}")
    print(query_df("""
        SELECT ROUND(AVG(ratio)::numeric, 3)                                          AS mean_ratio,
               ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY ratio)::numeric, 3) AS median_ratio,
               ROUND(MIN(s.baseline)::numeric, 3) AS min_baseline,
               ROUND(MAX(s.baseline)::numeric, 3) AS max_baseline
        FROM health h JOIN systems s ON s.id = h.system_id
    """).to_string(index=False))
