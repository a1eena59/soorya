"""Build all demo data in one go: tables, weather, fleet, health, model, alerts, console demo.

Run from backend/:
    .\\.venv\\Scripts\\python build_demo.py            (Windows)
    .venv/bin/python build_demo.py                   (Mac/Linux)

Stops at the first step that fails. Use --from <step> to resume, e.g. --from train.
"""
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = [
    ("db", "db.py", "Create tables"),
    ("weather", "weather.py", "Fetch 2025 satellite weather (needs internet the first time)"),
    ("simulate", "simulate.py", "Create 100 demo systems with faults"),
    ("expected", "expected.py", "Compute expected generation + health"),
    ("train", "train.py", "Train the fault classifier"),
    ("predict", "predict.py", "Detect faults, create alerts"),
    ("seed", "tools/seed_console_demo.py", "Demo visits + messages"),
]


def main():
    names = [s[0] for s in STEPS]
    start = 0
    if "--from" in sys.argv:
        step = sys.argv[sys.argv.index("--from") + 1]
        if step not in names:
            sys.exit(f"Unknown step '{step}'. Steps: {', '.join(names)}")
        start = names.index(step)

    total = time.time()
    for i, (name, script, label) in enumerate(STEPS[start:], start + 1):
        print(f"\n[{i}/{len(STEPS)}] {label}  ({script})", flush=True)
        t = time.time()
        result = subprocess.run([sys.executable, script], cwd=HERE)
        if result.returncode != 0:
            sys.exit(f"\nStep '{name}' failed. Fix the error above, then resume with:\n"
                     f"  python build_demo.py --from {name}")
        print(f"      done in {time.time() - t:.0f}s", flush=True)

    print(f"\nAll done in {time.time() - total:.0f}s. Start the API with: uvicorn main:app --reload")


if __name__ == "__main__":
    main()
