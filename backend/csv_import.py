"""Customer inverter exports (Growatt / Solis / Deye portal CSVs) -> daily kWh -> a monitored system.

Brand formats differ and change, so the parser looks for the *kind* of column
rather than exact names:
  daily energy   "Daily Yield (kWh)", "E-Today", "Today Energy", "Production"...
  lifetime total "Total Yield", "E-Total", "Cumulative"...       -> daily difference
  power          "AC Power (W)", "Pac", "Output Power"...         -> integrated over time
Rows can be daily or every few minutes.
"""
import io
import re
from datetime import date, timedelta

import numpy as np
import pandas as pd

from db import get_conn, insert_many, query_df
from locations import LOCATIONS

TIME_COL = re.compile(r"time|date|day|日期|时间", re.I)
TOTAL_COL = re.compile(r"total|cumulative|lifetime|e[-_ ]?total|accumulated", re.I)
DAILY_COL = re.compile(r"today|daily|e[-_ ]?day|yield|production|generation|energy|kwh", re.I)
POWER_COL = re.compile(r"power|\bpac\b|\bp[-_ ]?ac\b|output", re.I)
SKIP_COL = re.compile(r"export|import|grid|load|consum|battery|purchas|feed", re.I)

MIN_DAYS = 14


class ImportError_(ValueError):
    """Message is shown to the customer."""


def _read(raw: bytes) -> pd.DataFrame:
    for enc in ("utf-8-sig", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    lines = text.splitlines()
    # Portals often put a title or plant name above the header row
    header = next((i for i, l in enumerate(lines[:30])
                   if TIME_COL.search(l) and re.search(r"[,;\t]", l)), None)
    if header is None:
        raise ImportError_("Could not find a date/time column. Export the report as CSV from your inverter app.")
    df = pd.read_csv(io.StringIO("\n".join(lines[header:])), sep=None, engine="python")
    df.columns = [str(c).strip() for c in df.columns]
    return df.dropna(how="all")


def _parse_time(series):
    best = None
    for dayfirst in (True, False):
        t = pd.to_datetime(series, dayfirst=dayfirst, errors="coerce", format="mixed")
        if best is None or t.notna().sum() > best.notna().sum():
            best = t
    return best


def _number(series):
    return pd.to_numeric(series.astype(str).str.replace(",", "").str.extract(r"(-?\d+\.?\d*)")[0], errors="coerce")


def _scale(name, values, energy):
    """Wh -> kWh, W -> kW, from the column name or the size of the numbers."""
    n = name.lower()
    if "kw" in n:
        return values
    if re.search(r"\(w\)|\[w\]|\bw\b|\(wh\)|\[wh\]|\bwh\b", n):
        return values / 1000
    limit = 200 if energy else 50          # a home system never makes 200 kWh/day or 50 kW
    return values / 1000 if values.max() > limit else values


def parse(raw: bytes):
    try:
        return _parse(raw)
    except ImportError_:
        raise
    except Exception as e:                     # malformed file: tell the customer, not a 500
        raise ImportError_("Could not read this file as an inverter export. Please upload the CSV "
                           f"exported from your inverter app. ({type(e).__name__})") from e


def _parse(raw: bytes):
    df = _read(raw)
    time_col = next((c for c in df.columns if TIME_COL.search(c)), None)
    df["_t"] = _parse_time(df[time_col])
    df = df[df["_t"].notna()].sort_values("_t")
    if df.empty:
        raise ImportError_(f"Could not read dates in column '{time_col}'.")

    step_h = df["_t"].diff().median().total_seconds() / 3600
    intraday = step_h < 20
    df["_day"] = df["_t"].dt.normalize()
    cols = [c for c in df.columns if not c.startswith("_") and c != time_col and not SKIP_COL.search(c)]
    numeric = {c: _number(df[c]) for c in cols}
    numeric = {c: v for c, v in numeric.items() if v.notna().mean() > 0.5}
    warnings = []

    daily_col = next((c for c in numeric if DAILY_COL.search(c) and not TOTAL_COL.search(c)
                      and not POWER_COL.search(c.replace("Energy", ""))), None)
    total_col = next((c for c in numeric if TOTAL_COL.search(c)), None)
    power_col = next((c for c in numeric if POWER_COL.search(c) and not DAILY_COL.search(c)), None)

    if daily_col:
        v = _scale(daily_col, numeric[daily_col], energy=True)
        # Intraday rows carry a running "today" counter: the day's value is its maximum
        daily = v.groupby(df["_day"]).max() if intraday else v.groupby(df["_day"]).sum()
        method = f"daily energy column '{daily_col}'"
    elif total_col:
        v = _scale(total_col, numeric[total_col], energy=True)
        daily = v.groupby(df["_day"]).max().diff().dropna()
        method = f"lifetime total '{total_col}' (difference per day)"
    elif power_col and intraday:
        kw = _scale(power_col, numeric[power_col], energy=False).clip(lower=0)
        hours = df["_t"].diff().dt.total_seconds().div(3600).clip(upper=step_h * 3).fillna(step_h)
        daily = (kw * hours).groupby(df["_day"]).sum()
        coverage = df.groupby("_day").size() * step_h / 24
        partial = int((coverage < 0.5).sum())
        if partial:
            warnings.append(f"{partial} days had less than half a day of readings")
        method = f"power column '{power_col}' integrated every {step_h * 60:.0f} min"
    else:
        raise ImportError_("Could not find an energy (kWh) or power (W/kW) column in this file.")

    daily = daily[daily >= 0].round(3)
    if len(daily) < MIN_DAYS:
        raise ImportError_(f"Only {len(daily)} days of data. We need at least {MIN_DAYS} days to judge performance.")
    zero = int((daily == 0).sum())
    if zero:
        warnings.append(f"{zero} days with zero generation")
    return daily, {"method": method, "rows": len(df), "days": len(daily),
                   "first_day": str(daily.index.min().date()), "last_day": str(daily.index.max().date()),
                   "warnings": warnings}


def import_system(raw: bytes, owner_name: str, location: str, capacity_kw: float,
                  install_date: date | None = None, warranty_until: date | None = None):
    from expected import compute_health
    from weather import load_range

    loc = next((l for l in LOCATIONS if l[0] == location), None)
    if loc is None:
        raise ImportError_(f"Unknown location {location}")
    daily, info = parse(raw)

    # Sanity check: kWh per kW per day should be 0–8 for a home system
    per_kw = daily.median() / capacity_kw
    if per_kw > 8:
        raise ImportError_(f"The file shows about {daily.median():.0f} units/day, too much for {capacity_kw} kW. "
                           "Check the system size, or whether the column is in Wh.")
    if per_kw < 0.5:
        info["warnings"].append(f"Very low output ({daily.median():.1f} units/day for {capacity_kw} kW). "
                                "Check the system size.")

    first, last = daily.index.min().date(), daily.index.max().date()
    load_range(loc[0], loc[2], loc[3], str(first), str(last))

    install = install_date or first
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""INSERT INTO systems (name, owner_name, location, capacity_kw, install_date, warranty_until, source)
                       VALUES ('', %s, %s, %s, %s, %s, 'csv') RETURNING id""",
                    (owner_name, location, capacity_kw, install, warranty_until))
        sid = cur.fetchone()[0]
        cur.execute("UPDATE systems SET name = %s WHERE id = %s", (f"HOME-{sid:03d}", sid))

    insert_many("readings", ["time", "system_id", "kwh"],
                [(f"{d.date()} 00:00+05:30", sid, float(k)) for d, k in daily.items()])
    days = compute_health([sid])
    if days < MIN_DAYS:
        raise ImportError_("Weather data is not available for these dates yet. Try again in a few days.")
    refresh_neighbours(location)               # this roof is now a neighbour for others too
    from agent import maybe_step
    ran = maybe_step()                         # new data: the agent acts if it's on
    return {"system_id": sid, **info, "days_with_weather": days,
            "agent": None if ran is None else ran["actions"]}


def refresh_neighbours(location):
    """Peer comparison changes when a system joins or leaves an area: re-run predictions there."""
    from predict import run as run_predictions
    ids = query_df("SELECT id FROM systems WHERE location = %s", [location])["id"].tolist()
    if ids:
        run_predictions([int(i) for i in ids])


def delete_system(owner_name):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM systems WHERE source = 'csv' AND owner_name = %s RETURNING location", (owner_name,))
        locations = {r[0] for r in cur.fetchall()}
    for loc in locations:
        refresh_neighbours(loc)


if __name__ == "__main__":
    import sys
    from pathlib import Path
    for path in sys.argv[1:]:
        daily, info = parse(Path(path).read_bytes())
        print(Path(path).name, info)
        print(daily.head(3).to_string(), "\n")
