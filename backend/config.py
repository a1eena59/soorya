import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://soorya:soorya@localhost:5432/soorya")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")

DATA_DIR = ROOT / "data"
WEATHER_CACHE = DATA_DIR / "weather_cache"
GEMINI_CACHE = DATA_DIR / "gemini_cache"
MODELS_DIR = Path(__file__).resolve().parent / "models"

# Simulation window (one full year of real weather)
START_DATE = "2025-01-01"
END_DATE = "2025-12-31"

# Expected generation: capacity_kW × sunlight_kWh_m2 × PERFORMANCE_RATIO
PERFORMANCE_RATIO = 0.75

# KSEB average domestic tariff used for savings (₹/unit)
TARIFF_RS_PER_UNIT = 6.5

# Approximate rate KSEB pays for surplus units exported to the grid (₹/unit)
EXPORT_RATE_RS_PER_UNIT = 3.0

# Market price band for rooftop solar in Kerala (₹ per kW, installed)
PRICE_PER_KW_LOW = 50_000
PRICE_PER_KW_HIGH = 65_000

# Quote checks
OVERSIZE_FACTOR = 1.25          # quoted > 125% of what usage needs
UNDERSIZE_FACTOR = 0.75
MIN_WORKMANSHIP_YEARS = 5
MAX_ADVANCE_PCT = 50

# Installer console (demo)
INSTALLER_NAME = "Sunrise Solar Energy, Kochi"     # fictional installer
TECHNICIANS = ["Arun P", "Biju Thomas", "Sreeja K"]  # fictional technicians
VISIT_COST_RS = 1200                                # cost of one technician visit (time + travel)
UNDERPERFORMING_PCT = 90                            # below this % of expected = underperforming

# Real delivery for the demo (optional, see .env.example). Messages to the fake demo customers
# are redirected to YOUR Telegram chat / inbox, never to the placeholder numbers.
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
DEMO_EMAIL_TO = os.getenv("DEMO_EMAIL_TO", "").strip()
REAL_DELIVERY_MAX_PER_RUN = 3            # bulk / autopilot: only the first few go out for real

# Maintenance agent
AGENT_PERSIST_DAYS = 7           # a fault must persist this long before the agent opens a ticket
AGENT_IGNORE_BELOW_RS = 50       # loss per month below this: not worth a notification
AGENT_ESCALATE_ABOVE_RS = 300    # unanswered owner tickets escalate to a technician above this loss
AGENT_RECOVERED_PCT = 95         # verification: back within 5% of neighbours / expected
AGENT_REMIND_AFTER_DAYS = 3
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").strip()

# Where each technician starts the day (district from locations.py); routing uses distance from here
TECH_BASES = {"Arun P": "Kochi", "Biju Thomas": "Kozhikode", "Sreeja K": "Kottayam"}
ROAD_FACTOR = 1.35            # straight-line km -> rough road km in Kerala
