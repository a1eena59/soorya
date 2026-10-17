"""Reset the demo to a clean starting point (about 20 seconds).

  - rebuilds the simulated fleet as of 31 Dec 2025 (the demo clock may have moved it forward)
  - re-runs health + fault detection (uses the trained model; no retraining)
  - clears agent tickets, visits, messages and learned labels; agent OFF
  - removes the customer-connected sample so it can be imported live on /connect

Run from backend/: python tools/seed_console_demo.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from csv_import import delete_system
from db import get_conn
from expected import compute_health
from predict import run as run_predictions
from simulate import run as simulate


def main():
    delete_system("Menon residence (sample)")
    with get_conn() as conn, conn.cursor() as cur:
        for table in ("tickets", "confirmed_labels", "notifications", "work_orders"):
            cur.execute(f"DELETE FROM {table}")
        cur.execute("DELETE FROM settings")
    simulate()
    compute_health()
    run_predictions()
    print("Demo reset: 100 systems as of 31 Dec 2025, agent off, no tickets.")


if __name__ == "__main__":
    main()
