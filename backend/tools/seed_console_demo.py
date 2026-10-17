"""Reset the installer console to a believable demo state.

Clears all work orders and messages, then:
  - books visits for the inverter faults, grouped by area (one technician per area per day)
  - logs the matching "visit scheduled" SMS to those customers
  - logs a cleaning reminder for the two oldest dust cases
Leaves the string failures (incl. the Nair residence demo roof) and most dust cases
unhandled so they can be actioned live in the demo, turns autopilot OFF, and removes the
customer-connected sample so it can be imported live (/connect) while autopilot is on.

Run from backend/: python tools/seed_console_demo.py
"""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import maintenance
from db import get_conn

AREA_TECH = {"Kochi": "Arun P", "Kozhikode": "Biju Thomas", "Kannur": "Biju Thomas", "Pathanamthitta": "Sreeja K"}


def main():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM notifications")
        cur.execute("DELETE FROM work_orders")
        cur.execute("DELETE FROM settings WHERE key = 'autopilot'")      # autopilot OFF: switch it on in the demo

    # Customer-connected sample (2026 data) is re-imported live in the demo: start without it
    from csv_import import delete_system
    delete_system("Menon residence (sample)")

    fleet = maintenance.fleet()
    booked = 0
    for s in fleet:
        if s["lane"] != "technician" or s["issue"]["label"] != "inverter_off":
            continue
        tech = AREA_TECH.get(s["location"], "Sreeja K")
        day = date.fromisoformat(s["as_of"]) + timedelta(days=1 if tech != "Sreeja K" else 2)   # its own "today"
        maintenance.create_work_order(s["id"], s["issue"]["alert_id"], tech, day)
        booked += 1

    fleet = maintenance.fleet()                 # now with work orders attached
    for s in fleet:
        if s["work_order"]:
            maintenance.message_system(s, "visit_scheduled", "sms", real=False)

    dust = sorted((s for s in fleet if s["lane"] == "customer"), key=lambda s: s["issue"]["start_date"])[:2]
    for s in dust:
        maintenance.message_system(s, "clean_panels", "email", real=False)

    print(f"{booked} visits booked, {booked + len(dust)} messages logged")


if __name__ == "__main__":
    main()
