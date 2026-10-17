"""Real message delivery for the demo.

The demo customers have placeholder contacts, so real messages are REDIRECTED to the
presenter: SMS-style messages to your Telegram chat, emails to DEMO_EMAIL_TO (or to
Telegram when email isn't set up). With nothing configured, messages are only logged.

Returns (status, delivered_via, error):  ("sent", "telegram", None) | ("logged_demo", None, None) | ("failed", ..., "reason")
"""
import smtplib
from email.message import EmailMessage

import requests

from config import (DEMO_EMAIL_TO, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT, SMTP_USER, TELEGRAM_BOT_TOKEN,
                    TELEGRAM_CHAT_ID)


def channels():
    return {
        "telegram": bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID),
        "email": bool(SMTP_USER and SMTP_PASSWORD and DEMO_EMAIL_TO),
        "email_to": DEMO_EMAIL_TO or None,
    }


def _telegram(text):
    r = requests.post(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                      json={"chat_id": TELEGRAM_CHAT_ID, "text": text}, timeout=15)
    if not r.ok:
        raise RuntimeError(f"Telegram {r.status_code}: {r.text[:120]}")


def _email(subject, body):
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = SMTP_USER, DEMO_EMAIL_TO, subject or "Message from your solar installer"
    msg.set_content(body)
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as s:
        s.starttls()
        s.login(SMTP_USER, SMTP_PASSWORD)
        s.send_message(msg)


def deliver(channel, customer, recipient, subject, message):
    ch = channels()
    try:
        if channel == "email" and ch["email"]:
            _email(subject, f"[Demo: would go to {customer} <{recipient}>]\n\n{message}")
            return "sent", "email", None
        if ch["telegram"]:
            head = f"📱 SMS to {customer} ({recipient})" if channel == "sms" else f"📧 Email to {customer} ({recipient})\n{subject}"
            _telegram(f"{head}\n\n{message}")
            return "sent", "telegram", None
    except Exception as e:                       # never break the console because delivery failed
        return "failed", "email" if channel == "email" and ch["email"] else "telegram", str(e)[:200]
    return "logged_demo", None, None
