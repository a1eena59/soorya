# Soorya — 20-Hour Build Plan (solo)

Stack: React (Vite) + Tailwind + Recharts · FastAPI · PostgreSQL + TimescaleDB · Gemini (bill/quote) · Open-Meteo · scikit-learn RandomForest

| Hour | Task | Done when |
|---|---|---|
| 1 | Project structure, TimescaleDB in Docker, schema + hypertables, FastAPI + React skeletons | `/api/health` shows DB + TimescaleDB OK, React page loads |
| 2 | `weather.py` — Open-Meteo fetch for 14 Kerala locations, cache to disk, load into `weather` | `weather` has 365 rows × 14 locations |
| 3 | `simulate.py` — 100 systems, daily readings = capacity × sunlight × PR + noise | `readings` populated, numbers look sane |
| 4 | `simulate.py` — fault injection (soiling, string failure, inverter off) with labels | ~10–15 faulty systems, labels saved |
| 5 | `expected.py` — expected kWh, ratio, 7-day rolling mean → `health` | Rolling line visible in a quick plot |
| 6 | `features.py` — 7-day features (mean, change, slope, std, zero days, rain, recovery, peer mean) | Feature table with labels |
| 7 | `train.py` — RandomForest, 80/20 split, accuracy, confusion matrix → `model.pkl` | Metrics printed + saved to JSON |
| 8 | `predict.py` — classify every system, write `alerts`, alert text, top-3 "why" features | Alerts table filled with readable text |
| 9 | `audit.py` — Gemini bill reader (units, load, tariff) | Real KSEB bill → correct JSON |
| 10 | `audit.py` — Gemini quote reader + sizing + payback + verdict | Bill + quote → verdict card JSON |
| 11 | FastAPI endpoints: audit, systems, system health, alerts, fleet, model stats | All endpoints return data |
| 12 | Frontend: Home + Quote Audit page | Upload → verdict works in browser |
| 13 | Frontend: My System page (chart actual vs expected + rolling, badge, alerts, why) | Faulty system shows alert |
| 14 | Frontend: Installer dashboard + needs-attention list | "7 of 100 need attention" |
| 15 | Warranty tracker, monthly report, model stats page — **FEATURE FREEZE** | All 5 screens work |
| 16 | `csv_import.py` — Growatt / Solis / Deye parsers + real family data | Real CSV shows on dashboard |
| 17 | End-to-end testing, bug fixes | Full demo story runs without errors |
| 18 | UI polish, cache Gemini outputs, `pg_dump` of demo DB | Demo works offline |
| 19 | Rehearse demo ×3, record backup video | Video saved |
| 20 | Slides + buffer | Ready |

Breaks: 20 min after hours 4, 8, 12, 16.
