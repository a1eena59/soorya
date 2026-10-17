# Soorya — Rooftop Solar Accountability Layer

Independent verification of rooftop solar performance. A maintenance console for installers
(which systems are underperforming, which need a technician, which the owner can fix) with a
maintenance agent that takes every fault from alert to verified fix, plus a customer app (my system,
monthly report, connect inverter).

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
| `/agent` | Maintenance agent: tickets by stage, approve visits, demo clock (+3 days) |
| `/map` | Every system on a map of Kerala (needs internet for the map tiles) |
| `/fleet` | All systems (`/fleet?system=1` opens the Nair residence demo fault) |
| `/visits`, `/messages` | Technician visits, customer SMS/email outbox |
| `/detection` | Fault-detection accuracy |
| `/customer`, `/system/1`, `/system/1/report`, `/connect` | Customer app |
| `/respond/<token>` | Owner's reply page from the SMS link (Done / Book cleaning / Call me) |
| `/tech` | Technician phone app: route, job card, report Fixed / Couldn't fix |

## The maintenance agent

Starts only on faults that persisted 7+ days. Code makes every decision; Gemini only writes the
owner messages and breaks ties in edge cases, and its output is checked against hard safety rules.

| Stage | What happens |
|---|---|
| 1 Triage | **Wait** (dust + heavy rain in the next 3 days) · **Owner action** (dust, inverter restart) · **Data fix** (no data) · **Technician** (string fault, repeat inverter trip) · **Ignore** (under ₹50/month) |
| 2 Owner | SMS with a reply link (**Done / Book cleaning / Call me**). One reminder after 3 days; then escalate if over ₹300/month, else mark unresolved |
| 3 Verify | 3–5 days of output vs neighbours: within 5% → closed; otherwise escalated to a technician |
| 4 Technician | Job card (cause, confidence, inverter model, parts, warranty), nearest technician, driving-order route, installer approves the batch, reminders the day before |
| 5 Learn | Technician reports from the phone app: actual cause → confirmed label → **Retrain**; "couldn't fix" → follow-up visit |
| 6 Report | Fixed, owner-fix rate, ₹ recovered, unresolved |

**Demo clock.** The fleet's data ends on 31 Dec 2025. **⏩ +3 days** on the Agent page generates the
next days from real January 2026 weather, applying what happened (owner cleaned, inverter restarted,
technician fixed, rain washed the panels), re-runs detection and lets the agent verify.

## Technicians

- **Routing:** a fault goes to the technician already in that area that day; otherwise to the one closest
  to it (from their home base or any stop that day), max 4 visits each per day. Bases are in
  `config.py` (`TECH_BASES`). Each day's stops are put in driving order with km estimates.
- **Phone app (`/tech`):** pick a technician → today's stops in order, job card, Call / Navigate, then
  report **Fixed** (with the actual cause) or **Couldn't fix** (with a note). "Couldn't fix" makes the
  agent book a follow-up; "Fixed" is verified from the next days' output and becomes a training label.

Owner messages are **SMS** (demo: saved in Messages, not delivered). Each SMS has a reply link that opens
the owner's page with Done / Book cleaning / Call me.

## Before a demo

```powershell
cd backend
.\.venv\Scripts\python tools\seed_console_demo.py   # about 20 s: fleet back to 31 Dec 2025, agent off, no tickets
```

Demo flow:
1. Dashboard: 10 need a technician, 16 the owner can fix → open the Nair residence (string fault)
2. **Turn on agent** → it triages 26 faults: owners emailed, 6 visits proposed, 1 waits for rain
3. Messages: open an owner SMS → its reply link → tap **Done** (or use the owner's page `/system/<id>`)
4. Agent page → **Approve all** (owners get visit SMS) → Visits shows each technician's route →
   open **Phone view** → report one job **Fixed** (pick the cause) and one **Couldn't fix**
5. **⏩ +3 days** → the agent verifies: cleaned panels and repaired strings close as fixed
6. Customer app (`/system/<id>`): the owner sees the status and the same buttons

## Troubleshooting

| Problem | Fix |
|---|---|
| `Connection refused ... port 5432` | Start Docker Desktop, then `docker compose up -d` |
| Docker image pull fails (`auth.docker.io`, TLS error) | Network blocks Docker Hub; the compose file already uses `mirror.gcr.io`. Try another network if it still fails |
| Blank page on first load | Refresh once (Vite prepares files on first visit) |
| `pip` / `npm` timeouts | Slow network; rerun the command |
| Map shows dots on grey | No internet for map tiles; dots and clicks still work |
| "+3 days" says no weather | Open-Meteo is unreachable; check internet and try again |
| `module 'installer' has no attribute ...` / odd errors after pulling | Pull again: the backend module is now `maintenance.py`. Then `npm install` in `frontend` |

## Structure

```
soorya/
├── docker-compose.yml        TimescaleDB (PostgreSQL 16)
├── .env                      DATABASE_URL, optional Gemini key (from .env.example)
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
│   ├── agent.py              maintenance agent: triage, owner emails, verification, technician jobs, learning
│   ├── llm.py                Gemini for message wording + edge-case tie-breaks, behind safety checks
│   ├── sim_clock.py          demo clock: next days from real weather + what owners / technicians fixed
│   ├── delivery.py           message delivery (demo: logged; Telegram / SMTP hooks for later)
│   ├── customer.py           customer summary + monthly report
│   ├── csv_import.py         Growatt / Solis / Deye CSV import (triggers the agent)
│   └── tools/                seed_console_demo.py, make_sample_exports.py, telegram_chat_id.py
└── frontend/src/
    ├── installer/            maintenance console (dashboard, agent, map, fleet, visits, messages)
    ├── pages/                customer app (home, my system, report, connect, owner replies) + technician app
    └── components/           charts, gauge, upload box
```
