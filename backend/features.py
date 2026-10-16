"""7-day window features for the ML model (one row per system per day).

Run `python features.py` to print the feature table summary.
"""
import numpy as np
import pandas as pd

from config import END_DATE
from db import query_df

HEAVY_RAIN_MM = 10

FEATURES = [
    "rolling_mean_7",         # average health this week
    "change_vs_prev_7",       # this week minus last week (sudden drop?)
    "change_vs_30",           # this week minus the month before (slow decline?)
    "slope_7",                # trend inside the week, per day
    "std_7",                  # how jumpy the week was
    "min_7",                  # worst day this week
    "zero_days_7",            # days with ~zero output despite sunlight
    "rain_mm_7",              # rain this week
    "days_since_heavy_rain",  # dust builds up between heavy rains
    "rain_recovery",          # did output improve after the last heavy rain?
    "peer_median_7",          # neighbours' health this week (median: faulty neighbours don't drag it)
    "vs_peers_7",             # this roof relative to neighbours (weather hits everyone)
]

# When faults overlap, the label is the most serious one
PRIORITY = ["inverter_off", "string_failure", "soiling", "weather_dip"]
CLASSES = ["healthy", "weather_dip", "soiling", "string_failure", "inverter_off"]

SLOPE_W = np.arange(7) - 3.0          # least-squares slope over 7 points


def load_base(system_ids=None):
    sql = """
        SELECT h.time::date AS day, h.system_id, s.location, h.ratio, h.actual_kwh, h.expected_kwh,
               w.sunlight_kwh_m2, w.rain_mm
        FROM health h
        JOIN systems s ON s.id = h.system_id
        JOIN weather w ON w.location = s.location AND w.time = h.time
    """
    params = None
    if system_ids:
        sql += " WHERE h.system_id = ANY(%s)"
        params = [list(system_ids)]
    df = query_df(sql + " ORDER BY h.system_id, h.time", params)
    df["day"] = pd.to_datetime(df["day"])
    return df


def _rain_recovery(ratio, heavy):
    """Mean ratio in the 3 days after the latest heavy rain (within 14 days)
    minus the 3 days before it. 0 when there was no heavy rain."""
    out = np.zeros(len(ratio))
    last_rain = -999
    for i in range(len(ratio)):
        if heavy[i]:
            last_rain = i
        if 3 <= last_rain and i - last_rain <= 14 and i >= last_rain + 1:
            after = ratio[last_rain + 1:min(i, last_rain + 3) + 1].mean()
            before = ratio[last_rain - 3:last_rain].mean()
            out[i] = after - before
    return out


def _days_since(heavy):
    out = np.zeros(len(heavy))
    count = 30                          # unknown history: assume a while
    for i, h in enumerate(heavy):
        count = 0 if h else count + 1
        out[i] = count
    return out


def build_features(system_ids=None, peers_from_all=True):
    """Feature table. Peers are always computed from the whole fleet."""
    df = load_base(None if peers_from_all else system_ids)

    g = df.groupby("system_id")["ratio"]
    df["rolling_mean_7"] = g.transform(lambda s: s.rolling(7).mean())
    df["prev_mean_7"] = g.transform(lambda s: s.shift(7).rolling(7).mean())
    df["mean_30_before"] = g.transform(lambda s: s.shift(7).rolling(30, min_periods=7).mean())
    df["std_7"] = g.transform(lambda s: s.rolling(7).std())
    df["min_7"] = g.transform(lambda s: s.rolling(7).min())
    df["slope_7"] = g.transform(lambda s: s.rolling(7).apply(lambda y: np.dot(SLOPE_W, y) / 28.0, raw=True))
    df["change_vs_prev_7"] = df["rolling_mean_7"] - df["prev_mean_7"]
    df["change_vs_30"] = df["rolling_mean_7"] - df["mean_30_before"]

    zero = ((df["ratio"] < 0.05) & (df["sunlight_kwh_m2"] > 3)).astype(int)
    df["zero_days_7"] = zero.groupby(df["system_id"]).transform(lambda s: s.rolling(7).sum())
    df["rain_mm_7"] = df.groupby("system_id")["rain_mm"].transform(lambda s: s.rolling(7).sum())

    heavy = df["rain_mm"] >= HEAVY_RAIN_MM
    df["days_since_heavy_rain"] = 0.0
    df["rain_recovery"] = 0.0
    for sid, idx in df.groupby("system_id").groups.items():
        h = heavy.loc[idx].to_numpy()
        df.loc[idx, "days_since_heavy_rain"] = _days_since(h)
        df.loc[idx, "rain_recovery"] = _rain_recovery(df.loc[idx, "ratio"].to_numpy(), h)

    # Neighbours: every system at the same location on the same day
    grp = df.groupby(["location", "day"])["rolling_mean_7"]
    df["peer_count"] = grp.transform("count") - 1
    df["peer_median_7"] = grp.transform("median")
    # No neighbours on record for these dates: compare with the satellite expectation only
    df.loc[df["peer_count"] == 0, "peer_median_7"] = 1.0
    df["vs_peers_7"] = df["rolling_mean_7"] / df["peer_median_7"].clip(lower=0.05) - 1

    df = df[df["prev_mean_7"].notna()].copy()        # need two full weeks of history
    df["change_vs_30"] = df["change_vs_30"].fillna(df["change_vs_prev_7"])
    if system_ids and peers_from_all:
        df = df[df["system_id"].isin(system_ids)]
    return df.reset_index(drop=True)


def attach_labels(df):
    """Ground-truth label for each system-day from fault_labels (simulator only)."""
    labels = query_df("SELECT system_id, start_date, end_date, fault FROM fault_labels")
    rank = {f: i for i, f in enumerate(PRIORITY)}
    best = {}
    for r in labels.itertuples():
        end = r.end_date or pd.Timestamp(END_DATE).date()
        for d in pd.date_range(r.start_date, end):
            key = (r.system_id, d)
            if key not in best or rank[r.fault] < rank[best[key]]:
                best[key] = r.fault
    df["label"] = [best.get((s, d), "healthy") for s, d in zip(df["system_id"], df["day"])]
    return df


if __name__ == "__main__":
    feats = attach_labels(build_features())
    print(f"{len(feats)} rows, {len(FEATURES)} features")
    print(feats["label"].value_counts().to_string())
    print()
    print(feats.groupby("label")[FEATURES].mean().round(3).T.to_string())
