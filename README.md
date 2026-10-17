# Soorya — Rooftop Solar Accountability Layer

Independent verification of rooftop solar performance. A maintenance console for installers
(which systems are underperforming, which need a technician, which the customer can fix, with an
autopilot that books visits and messages customers), plus a customer app (my system, monthly report,
connect inverter).

See [PLAN.md](PLAN.md) for the build plan.

## Setup (first time, about 10 minutes)

You need: **Docker Desktop** (running), **Python 3.11**, **Node.js 20+**. Commands are for Windows
PowerShell; on Mac/Linux use `.venv/bin/` instead of `.\.venv\Scripts\`.

```powershell
git clone <repo-url> soorya
cd soorya

# 1. Settings
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
| `/queue` | Work queue: needs technician / customer can fix / watching |
| `/autopilot` | Autopilot: books visits + messages customers automatically |
| `/map` | Every system on a map of Kerala (needs internet for the map tiles) |
| `/fleet` | All systems (`/fleet?system=1` opens the Nair residence demo fault) |
| `/visits`, `/messages` | Technician visits, customer SMS/email outbox |
| `/detection` | Fault-detection accuracy |
| `/customer`, `/system/1`, `/system/1/report`, `/connect` | Customer app |

## Real messages during the demo (optional, 5 minutes)

Demo customers have placeholder contacts, so real messages are redirected to **you**. At most 3 per
autopilot run are delivered; the rest are logged.

**Telegram** (recommended: messages pop up on your phone):
1. In Telegram, open **@BotFather** → `/newbot` → copy the token into `TELEGRAM_BOT_TOKEN` in `.env`
2. Open your new bot and send it any message
3. `cd backend` → `.\.venv\Scripts\python tools\telegram_chat_id.py` → copy the id into `TELEGRAM_CHAT_ID`
4. Restart the backend. The Autopilot page shows "Telegram connected".

**Email** (Gmail): Google Account → Security → 2-Step Verification → App passwords. Put your Gmail in
`SMTP_USER`, the app password in `SMTP_PASSWORD`, and where to receive in `DEMO_EMAIL_TO`.

## Before a demo

```powershell
cd backend
.\.venv\Scripts\python tools\seed_console_demo.py   # reset: 4 visits, 6 messages, autopilot OFF
```

Demo flow: dashboard → open the Nair residence → turn **Autopilot on** (visits booked, customers messaged,
your phone buzzes) → `/connect` → "Try with a sample" (new system arrives, autopilot books its visit by itself).

## Troubleshooting

| Problem | Fix |
|---|---|
| `Connection refused ... port 5432` | Start Docker Desktop, then `docker compose up -d` |
| Docker image pull fails (`auth.docker.io`, TLS error) | Network blocks Docker Hub; the compose file already uses `mirror.gcr.io`. Try another network if it still fails |
| Blank page on first load | Refresh once (Vite prepares files on first visit) |
| `pip` / `npm` timeouts | Slow network; rerun the command |
| Map shows dots on grey | No internet for map tiles; dots and clicks still work |
| Message shows "Failed" | Check the Telegram token / chat id or Gmail app password in `.env`, then restart the backend |
| `module 'installer' has no attribute ...` / odd errors after pulling | Pull again: the backend module is now `maintenance.py`. Then `npm install` in `frontend` |

## Structure

```
soorya/
├── docker-compose.yml        TimescaleDB (PostgreSQL 16)
├── .env                      DATABASE_URL, optional Telegram / email (from .env.example)
├── data/
│   ├── samples/              synthetic inverter CSVs
│   └── weather_cache/        cached Open-Meteo responses (generated)
├── archive/quote_audit.py    removed quote-check feature (Gemini bill/quote reader), kept for reference
├── backend/
│   ├── main.py               FastAPI routes
│   ├── config.py             settings + constants (tariff, thresholds, technicians, delivery)
│   ├── db.py, schema.sql     database setup (hypertables, continuous aggregate)
│   ├── weather.py            Open-Meteo satellite weather
│   ├── simulate.py           demo fleet + fault injection
│   ├── expected.py           expected generation, health ratio, 7-day mean
│   ├── features.py           7-day ML features (incl. neighbour comparison)
│   ├── train.py, predict.py  RandomForest fault classifier, alerts
│   ├── maintenance.py        installer console: lanes, KPIs, map positions, visits, messages
│   ├── autopilot.py          automatic visit booking + customer messages
│   ├── delivery.py           real delivery to the presenter's Telegram / email
│   ├── customer.py           customer summary + monthly report
│   ├── csv_import.py         Growatt / Solis / Deye CSV import (triggers autopilot)
│   └── tools/                seed_console_demo.py, make_sample_exports.py, telegram_chat_id.py
└── frontend/src/
    ├── installer/            maintenance console (dashboard, queue, autopilot, map, fleet, visits, messages)
    ├── pages/                customer app (home, my system, monthly report, connect)
    └── components/           charts, gauge, upload box
```
