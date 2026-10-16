# Soorya — Rooftop Solar Accountability Layer

Independent verification of rooftop solar: quote audit before purchase, weather-adjusted performance monitoring after.

See [PLAN.md](PLAN.md) for the hour-by-hour build plan.

## Structure

```
soorya/
├── docker-compose.yml    TimescaleDB (PostgreSQL 16)
├── .env                  DATABASE_URL, GEMINI_API_KEY (copy from .env.example)
├── data/
│   ├── weather_cache/    cached Open-Meteo responses (offline demo)
│   ├── gemini_cache/     cached bill/quote extractions (offline demo)
│   └── samples/          sample bills, quotes, inverter CSVs
├── backend/
│   ├── main.py           FastAPI routes
│   ├── config.py         settings + constants
│   ├── db.py             connection, schema init (python db.py)
│   ├── schema.sql        tables, hypertables, continuous aggregate
│   ├── locations.py      14 Kerala district locations
│   ├── weather.py        Open-Meteo → weather
│   ├── simulate.py       synthetic fleet + fault injection
│   ├── expected.py       expected kWh, ratio, 7-day rolling mean
│   ├── features.py       7-day ML features
│   ├── train.py          RandomForest → models/model.pkl
│   ├── predict.py        classify + alerts
│   ├── audit.py          Gemini bill/quote + sizing + payback
│   └── csv_import.py     Growatt / Solis / Deye parsers
└── frontend/             React + Vite + Tailwind + Recharts
    └── src/pages/        Home, QuoteAudit, MySystem, Installer, ModelStats
```

## Run

```powershell
# 1. Database
docker compose up -d

# 2. Backend
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python db.py            # create schema
.\.venv\Scripts\uvicorn main:app --reload   # http://localhost:8000/docs

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                              # http://localhost:5173
```
