# Soorya — Rooftop Solar Accountability Layer

Independent verification of rooftop solar performance. A maintenance console for installers
(which systems are underperforming, which need a technician, which the customer can fix),
plus customer tools (quote check, my system, monthly report).

See [PLAN.md](PLAN.md) for the build plan.

## Setup (first time, about 10 minutes)

You need: **Docker Desktop** (running), **Python 3.11**, **Node.js 20+**, and a **Gemini API key**
(free, from Google AI Studio). Commands are for Windows PowerShell; on Mac/Linux use
`.venv/bin/` instead of `.\.venv\Scripts\`.

```powershell
git clone <repo-url> soorya
cd soorya

# 1. Settings: copy, then put your Gemini key in .env
copy .env.example .env

# 2. Database (TimescaleDB in Docker)
docker compose up -d

# 3. Backend packages
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt

# 4. Build all demo data in one go (about 1 minute, needs internet the first time)
.\.venv\Scripts\python build_demo.py
#    It runs: db.py → weather.py → simulate.py → expected.py → train.py → predict.py → tools\seed_console_demo.py
#    If a step fails, fix it and resume, e.g.:  .\.venv\Scripts\python build_demo.py --from train

# 5. Frontend packages
cd ..\frontend
npm install
```

## Run (every time)

Two terminals:

```powershell
# Terminal 1: backend  -> http://localhost:8000/docs
cd backend
.\.venv\Scripts\uvicorn main:app --reload

# Terminal 2: frontend -> http://localhost:5173
cd frontend
npm run dev
```

Docker Desktop must be running. If the database is stopped: `docker compose up -d` from the project folder.

## Where to look

| URL | What |
|---|---|
| `/` | Installer dashboard |
| `/queue` | Work queue: technician / customer can fix / watching |
| `/fleet` | All systems (`/fleet?system=1` opens the Nair residence demo fault) |
| `/visits`, `/messages` | Technician visits, customer SMS/email outbox (demo: logged, not sent) |
| `/detection` | Fault-detection accuracy |
| `/customer`, `/audit?demo=1`, `/system/1`, `/connect` | Customer app |

## Before a demo

```powershell
cd backend
.\.venv\Scripts\python tools\seed_console_demo.py   # reset visits + messages
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `Connection refused ... port 5432` | Start Docker Desktop, then `docker compose up -d` |
| Docker image pull fails (`auth.docker.io`, TLS error) | Network blocks Docker Hub; the compose file already uses `mirror.gcr.io`. Try another network if it still fails |
| Blank page on first load | Refresh once (Vite prepares files on first visit) |
| `/audit?demo=1` says samples missing | The demo bill photo is private and not in git. Ask for it and put it at `data/samples/sample.jpeg`, or upload your own KSEB bill on `/audit` |
| Gemini 503 / "high demand" | Retry; the app falls back to other Gemini models automatically |
| `pip` / `npm` timeouts | Slow network; rerun the command |

## Structure

```
soorya/
├── docker-compose.yml        TimescaleDB (PostgreSQL 16)
├── .env                      DATABASE_URL, GEMINI_API_KEY, GEMINI_MODEL (from .env.example)
├── data/
│   ├── samples/              sample quote, synthetic inverter CSVs (real bills are not in git)
│   ├── weather_cache/        cached Open-Meteo responses (generated)
│   └── gemini_cache/         cached bill/quote reads (generated)
├── backend/
│   ├── main.py               FastAPI routes
│   ├── config.py             settings + constants (tariff, thresholds, technicians)
│   ├── db.py, schema.sql     database setup (hypertables, continuous aggregate)
│   ├── weather.py            Open-Meteo satellite weather
│   ├── simulate.py           demo fleet + fault injection
│   ├── expected.py           expected generation, health ratio, 7-day mean
│   ├── features.py           7-day ML features (incl. neighbour comparison)
│   ├── train.py, predict.py  RandomForest fault classifier, alerts
│   ├── installer.py          installer console: lanes, KPIs, visits, messages
│   ├── customer.py           customer summary + monthly report
│   ├── audit.py              Gemini bill/quote reading, sizing, verdict
│   ├── csv_import.py         Growatt / Solis / Deye CSV import
│   └── tools/                seed_console_demo.py, make_sample_exports.py
└── frontend/src/
    ├── installer/            maintenance console (dashboard, queue, fleet, visits, messages)
    ├── pages/                customer app (quote audit, my system, report, connect)
    └── components/           shared charts and upload box
```
