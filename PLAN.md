# Soorya — 20-Hour Build Plan (solo, customer-first)

Stack: React (Vite) + Tailwind + Recharts · FastAPI · PostgreSQL + TimescaleDB · Gemini (bill/quote) · Open-Meteo · scikit-learn RandomForest

**Primary user: the homeowner.** Installer dashboard is secondary (footer link).

| Hour | Task | Status |
|---|---|---|
| 1 | Project structure, TimescaleDB in Docker, schema + hypertables, FastAPI + React skeletons | ✅ |
| 2 | `weather.py`: Open-Meteo for 14 Kerala locations, cached, loaded into `weather` | ✅ |
| 3 | `simulate.py`: 100 systems, daily readings, local weather dips | ✅ |
| 4 | `simulate.py`: fault injection (soiling, string failure, inverter off) with labels | ✅ |
| 5 | `expected.py`: expected kWh, commissioning baseline, 7-day rolling mean → `health` | ✅ |
| 6 | `features.py`: 12 seven-day features incl. neighbour median | ✅ |
| 7 | `train.py`: RandomForest, grouped CV (96.3%), hero held out (94.3%) | ✅ |
| 8 | `predict.py`: daily labels, persistent-fault alerts with reasons, API endpoints | ✅ |
| 9 | `audit.py`: Gemini bill reader (cached, fallback models) | ✅ |
| 10 | `audit.py`: Gemini quote reader + sizing + payback + verdict + sample quote | ✅ |
| 11 | **Customer:** Home + Quote Audit page (upload, edit numbers, verdict, chart, flags, questions, WhatsApp share, `?demo=1`) | ✅ |
| 12 | **Customer:** My System page: health score, actual vs expected chart, plain-language alert, warranty status, money lost | |
| 13 | **Customer:** Connect my inverter: upload Growatt / Solis / Deye CSV (`csv_import.py`) → own system page | |
| 14 | **Customer:** Monthly report (units, ₹ saved, health) + share, warranty countdown | |
| 15 | **Customer:** Quote audit → "after you install, monitor it here" link; Malayalam labels on key screens. **FEATURE FREEZE** | |
| 16 | Secondary: minimal installer view + model stats page | |
| 17 | End-to-end testing, bug fixes | |
| 18 | UI polish, phone layout check, `pg_dump` of demo DB | |
| 19 | Rehearse demo ×3, record backup video | |
| 20 | Slides + buffer | |

Demo entry points: `/audit?demo=1` (quote check), `/system/1` (Nair residence string failure).
