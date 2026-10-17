"""Find your Telegram chat id for the demo.

1. Put TELEGRAM_BOT_TOKEN in .env (from @BotFather)
2. Open your bot in Telegram and send it any message (e.g. "hi")
3. Run from backend/: python tools/telegram_chat_id.py   -> copy the id into TELEGRAM_CHAT_ID
"""
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import TELEGRAM_BOT_TOKEN

if not TELEGRAM_BOT_TOKEN:
    sys.exit("Set TELEGRAM_BOT_TOKEN in .env first")
updates = requests.get(f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/getUpdates", timeout=15).json()
chats = {u["message"]["chat"]["id"]: u["message"]["chat"].get("first_name", "") for u in updates.get("result", []) if "message" in u}
if not chats:
    sys.exit("No messages yet. Send your bot a message in Telegram, then run this again.")
for cid, name in chats.items():
    print(f"TELEGRAM_CHAT_ID={cid}   ({name})")
