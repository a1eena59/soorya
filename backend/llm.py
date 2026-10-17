"""The only two places the agent uses an LLM (Gemini), both fenced in by code:

  write_message()  -> wording of owner messages. Output is checked against hard safety rules;
                      anything unsafe, too long or failed falls back to a fixed template.
  choose_route()   -> tie-break between routes that CODE already allowed (edge cases only).
                      An answer outside the allowed set is ignored.

Thresholds, recovery checks and safety rules never depend on the LLM.
"""
import json
import re

from config import GEMINI_API_KEY, GEMINI_MODEL

# The agent must never suggest touching the DC side or anything electrical inside the system
UNSAFE = re.compile(r"\b(dc|wir(e|es|ing)|cable|connector|mc4|terminal|fuse|open(ing)? the inverter|"
                    r"inside the inverter|multimeter|voltage|climb|solder)\b", re.I)


def available():
    return bool(GEMINI_API_KEY)


def _ask(prompt, max_tokens=300):
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=GEMINI_API_KEY)
    for model in [GEMINI_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest"]:
        try:
            r = client.models.generate_content(
                model=model, contents=prompt,
                config=types.GenerateContentConfig(temperature=0.3, max_output_tokens=max_tokens))
            if r.text:
                return r.text.strip()
        except Exception:
            continue
    return None


def is_safe(text, max_words=90):
    return bool(text) and not UNSAFE.search(text) and len(text.split()) <= max_words


def write_message(facts, fallback):
    """facts: dict of plain facts. Returns (text, source) where source is 'llm' or 'template'."""
    if not available():
        return fallback, "template"
    prompt = (
        "Write a short, friendly message from a solar installer to a homeowner in Kerala.\n"
        "Rules: under 70 words, plain English, no jargon, no greeting line like 'Dear', no sign-off.\n"
        "Use only these facts, do not invent numbers. Never suggest touching wiring, cables, connectors "
        "or anything inside the inverter. Say which button to tap.\n"
        f"Facts: {json.dumps(facts)}"
    )
    try:
        text = _ask(prompt)
    except Exception:
        text = None
    if text and is_safe(text):
        return text, "llm"
    return fallback, "template"


def choose_route(facts, allowed, default):
    """Edge cases only: let the LLM pick among routes code already allowed. Returns (route, note)."""
    if not available():
        return default, None
    prompt = (
        "You triage rooftop solar faults. Choose exactly one route from this list: "
        f"{', '.join(allowed)}.\nFacts: {json.dumps(facts)}\n"
        'Answer as JSON: {"route": "...", "why": "one short sentence"}'
    )
    try:
        raw = _ask(prompt, 150) or ""
        data = json.loads(re.search(r"\{.*\}", raw, re.S).group(0))
        if data.get("route") in allowed and is_safe(data.get("why", ""), 40):
            return data["route"], data.get("why")
    except Exception:
        pass
    return default, None
