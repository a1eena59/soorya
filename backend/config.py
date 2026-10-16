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
