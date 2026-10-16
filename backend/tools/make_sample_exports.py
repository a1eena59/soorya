"""Synthetic inverter exports for testing csv_import.py (and the demo).

Built on REAL 2026 Kochi weather from Open-Meteo, with known problems injected:
  - dust building up in the dry season, washed off by heavy rain
  - one of three panel strings failing on 20 Aug 2026 (never fixed)

Writes three formats to data/samples/:
  sample_daily_export.csv    title rows, DD/MM/YYYY, daily kWh       (typical daily report)
  sample_power_export.csv    every 15 min, AC power in W              (typical detailed export)
  sample_total_export.csv    semicolon-separated, lifetime kWh counter

Run from backend/: python tools/make_sample_exports.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import PERFORMANCE_RATIO, ROOT
from weather import fetch_daily

OUT = ROOT / "data" / "samples"
CAPACITY_KW = 4.0
START, END = "2026-01-01", "2026-09-30"
FAULT_DAY = "2026-08-20"


def daily_kwh():
    w = fetch_daily("Kochi", 9.9312, 76.2673, START, END)
    df = pd.DataFrame({"day": pd.to_datetime(w["time"]),
                       "sun": np.array(w["shortwave_radiation_sum"], dtype=float) / 3.6,
                       "rain": np.array(w["precipitation_sum"], dtype=float)})
    rng = np.random.default_rng(7)
    dust, level = [], 1.0
    for r in df["rain"]:
        level = 1.0 if r >= 10 else max(level - 0.005, 0.75)
        dust.append(level)
    string = np.where(df["day"] >= FAULT_DAY, 2 / 3, 1.0)
    noise = rng.normal(1.0, 0.04 + 0.06 * (df["rain"] > 10))
    df["kwh"] = (CAPACITY_KW * df["sun"] * PERFORMANCE_RATIO * 1.02 * np.array(dust) * string * noise).clip(lower=0)
    return df


def write_daily(df):
    lines = ["Plant Report,Menon Residence (sample)", "Device SN,SAMPLE-0001", ""]
    lines.append("Date,Daily Yield (kWh),Grid Export (kWh)")
    for r in df.itertuples():
        lines.append(f"{r.day:%d/%m/%Y},{r.kwh:.1f},{r.kwh * 0.4:.1f}")
    (OUT / "sample_daily_export.csv").write_text("\n".join(lines) + "\n")


def write_power(df):
    rows = []
    for r in df[df["day"] >= "2026-07-01"].itertuples():
        times = pd.date_range(r.day + pd.Timedelta(hours=6), r.day + pd.Timedelta(hours=18, minutes=45), freq="15min")
        hours = np.asarray((times - r.day).total_seconds()) / 3600
        shape = np.clip(np.sin(np.pi * (hours - 6.25) / 12), 0, None)
        kw = shape / (shape.sum() * 0.25) * r.kwh if shape.sum() else shape     # integrates to the day's kWh
        rows += [f"{t:%Y-%m-%d %H:%M:%S},{p * 1000:.0f},{28 + 10 * s:.1f}" for t, p, s in zip(times, kw, shape)]
    (OUT / "sample_power_export.csv").write_text("Time,AC Power(W),Inverter Temperature(C)\n" + "\n".join(rows) + "\n")


def write_total(df):
    total = 1250.0 + df["kwh"].cumsum()
    lines = ["Timestamp;E-Total(kWh);Pac(W)"] + [
        f"{d:%Y-%m-%d} 19:00;{t:.1f};0" for d, t in zip(df["day"], total)]
    (OUT / "sample_total_export.csv").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    df = daily_kwh()
    write_daily(df)
    write_power(df)
    write_total(df)
    print(f"{len(df)} days, {df['kwh'].sum():.0f} kWh total, string failure from {FAULT_DAY}")
