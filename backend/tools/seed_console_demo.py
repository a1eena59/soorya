"""Reset the installer console to a believable demo state.

Clears all work orders and messages, then:
  - books visits for the inverter faults, grouped by area (one technician per area per day)
  - logs the matching "visit scheduled" SMS to those customers
  - logs a cleaning reminder for the two oldest dust cases
Leaves the string failures (incl. the Nair residence demo roof) and most dust cases
unhandled so they can be actioned live in the demo.

Run from backend/: python tools/seed_console_demo.py
"""
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import installer
from db import get_conn

AREA_TECH = {"Kochi": "Arun P", "Kozhikode": "Biju Thomas", "Kannur": "Biju Thomas", "Pathanamthitta": "Sreeja K"}


def main():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM notifications")
        cur.execute("DELETE FROM work_orders")

    fleet = installer.fleet()
    as_of = date.fromisoformat(max(s["as_of"] for s in fleet))
    booked = 0
    for s in fleet:
        if s["lane"] != "technician" or s["issue"]["label"] != "inverter_off":
            continue
        tech = AREA_TECH.get(s["location"], "Sreeja K")
        day = as_of + timedelta(days=1 if tech != "Sreeja K" else 2)
        installer.create_work_order(s["id"], s["issue"]["alert_id"], tech, day)
        booked += 1

    fleet = installer.fleet()                 # now with work orders attached
    for s in fleet:
        if s["work_order"]:
            m = installer.compose(s, "visit_scheduled", "sms")
            installer.send_message(s["id"], s["issue"]["alert_id"], "sms", m["recipient"], None, m["message"], "visit_scheduled")

    dust = sorted((s for s in fleet if s["lane"] == "customer"), key=lambda s: s["issue"]["start_date"])[:2]
    for s in dust:
        m = installer.compose(s, "clean_panels", "email")
        installer.send_message(s["id"], s["issue"]["alert_id"], "email", m["recipient"], m["subject"], m["message"], "clean_panels")

    print(f"{booked} visits booked, {booked + len(dust)} messages logged")


if __name__ == "__main__":
    main()
