# Soorya — 20-Hour Build Plan (solo, installer-first)

Stack: React (Vite) + Tailwind + Recharts · FastAPI · PostgreSQL + TimescaleDB · Gemini (bill/quote) · Open-Meteo · scikit-learn RandomForest

**Primary user: the installer** (maintenance console at `/`). Customer app at `/customer` (quote check, my system, monthly report, connect inverter).

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
| 12 | **Customer:** My System page: status, alert + reasons, WhatsApp to installer, money tiles, warranty countdown, chart, past problems | ✅ |
| 13 | **Customer:** Connect my inverter: CSV import (daily / power / lifetime formats), 2026 weather, neighbour refresh | ✅ |
| 14 | **Customer:** Monthly report: month picker, headline, made / performance / saved / lost, daily chart, weather, problems, WhatsApp share, save as PDF | ✅ |
| 15 | **Installer console:** dashboard (KPIs, priority list, area map, health trend, issues by area), work queue (technician / customer fix / watching), fleet table (filters, sparklines, CSV export), system panel, schedule visits, SMS/email to customers (demo outbox), visits board, detection accuracy | ✅ |
| 16 | Real SMS / email gateway (optional), visit-done → confirm fix from data | |
| 17 | End-to-end testing, bug fixes. **FEATURE FREEZE** | |
| 18 | UI polish, `pg_dump` of demo DB, reset script check | |
| 19 | Rehearse demo ×3, record backup video | |
| 20 | Slides + buffer | |

Demo entry points: `/` installer dashboard, `/queue`, `/fleet?system=1` (Nair residence panel), `/visits`, `/messages`, `/detection`. Customer app: `/customer`, `/audit?demo=1`, `/system/1`, `/connect`.

Reset the console demo (visits + messages): `python tools/seed_console_demo.py` (from `backend/`).

Sample exports: `python tools/make_sample_exports.py` (from `backend/`).
