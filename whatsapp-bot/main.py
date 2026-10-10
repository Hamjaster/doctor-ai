import base64
import hashlib
import hmac
import json
import logging
import os
import re
import sqlite3
from urllib.parse import urlsplit

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request

WAHA_URL = "http://localhost:3000"  # matches the port in docker-compose.yml
WAHA_API_KEY = os.environ["WAHA_API_KEY"]
WAHA_HMAC_KEY = os.environ["WAHA_HMAC_KEY"].encode()
if not WAHA_HMAC_KEY:
    raise RuntimeError("WAHA_HMAC_KEY is empty, so anyone could forge webhook signatures")
OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]
OPENROUTER_MODEL = os.environ["OPENROUTER_MODEL"]
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

INSTRUCTIONS = f"""You are Jamshed Khatri, a friendly AI doctor chatting with patients on WhatsApp.
Patients describe their symptoms and can send photos. Ask about their symptoms, ask them to send a
clear, well-lit photo of the affected area when it would help, describe what you see, and explain
what it might be in plain language. Ask follow-up questions like a real doctor would. Then:
- Minor issue: suggest simple home care, common over-the-counter options (used as the pack says)
  and what to avoid, and when to see a doctor if it doesn't get better.
- Needs treatment: say which kind of doctor to see and how soon.
- Serious, unclear from a photo, or needs a closer look: invite them to a live video consultation
  at {os.environ["VIDEO_CALL_URL"]}
Keep replies short and conversational, like WhatsApp messages: usually under 100 words, a few
questions or tips at a time. Format for WhatsApp: *single
asterisks* for bold, _underscores_ for italics, "- " for bullet points and plain URLs; never use
Markdown headings, **double asterisks**, tables or [text](link) links. Reply in the patient's
language (English, Urdu or Roman Urdu). Never prescribe prescription-only medicines.
In your first reply, and whenever you say what something might be, say you are an AI and not a
substitute for an in-person doctor. Urge emergency care right away (call 1122 in Pakistan) for
red-flag symptoms such as chest pain, trouble breathing, heavy bleeding or thoughts of self-harm."""

log = logging.getLogger("uvicorn.error")
app = FastAPI()
db = sqlite3.connect(os.getenv("DB_PATH", "bot.db"), check_same_thread=False, isolation_level=None)
db.executescript("""
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, sender TEXT, role TEXT, content TEXT);
    CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY);
""")


@app.post("/webhook")
async def webhook(request: Request, background: BackgroundTasks):
    body = await request.body()
    expected = hmac.new(WAHA_HMAC_KEY, body, hashlib.sha512).hexdigest()
    if not hmac.compare_digest(expected.encode(), request.headers.get("x-webhook-hmac", "").encode()):
        raise HTTPException(403, "bad signature")
    event = json.loads(body)
    if event.get("event") == "message":
        background.add_task(handle, event["payload"])  # ack right away; WAHA retries slow or failed webhooks
    return {"ok": True}


async def handle(msg):
    try:
        await reply_to(msg)
    except Exception:
        log.exception("failed to handle message %s", msg.get("id"))


async def reply_to(msg):
    chat = msg["from"]
    if msg.get("fromMe") or chat.endswith(("@g.us", "@broadcast", "@newsletter")):
        return  # only 1:1 chats: never answer in groups, status updates or channels
    # ponytail: `seen` gains a row per message forever; prune old ids if the db file ever gets big
    if db.execute("INSERT OR IGNORE INTO seen VALUES (?)", (msg["id"],)).rowcount == 0:
        return  # already handled this message id

    text = content = msg.get("body") or ""
    if msg.get("hasMedia"):
        media = msg.get("media") or {}
        mimetype = media.get("mimetype") or ""
        if not media.get("url") or not mimetype.startswith("image/"):  # voice notes, videos, documents...
            await send(chat, "I can only read text messages and photos. Please type your question or send a photo.")
            return
        # fetch by path from our own WAHA, so the API key never goes to another host
        image = await call("GET", WAHA_URL + urlsplit(media["url"]).path, headers={"X-Api-Key": WAHA_API_KEY})
        content = [
            {"type": "text", "text": text or "(photo)"},
            {"type": "image_url", "image_url": {"url": f"data:{mimetype};base64,{base64.b64encode(image.content).decode()}"}},
        ]
        text = f"[photo] {text}".strip()  # history keeps a note of the photo, not the image
    elif not text:
        return  # no text and nothing attached, e.g. a system notice

    history = db.execute("SELECT role, content FROM messages WHERE sender = ? ORDER BY id", (chat,))
    messages = (
        [{"role": "system", "content": INSTRUCTIONS}]
        + [{"role": r, "content": c} for r, c in history]
        + [{"role": "user", "content": content}]
    )
    response = await call("POST", OPENROUTER_URL, headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
                          json={"model": OPENROUTER_MODEL, "messages": messages})
    reply = whatsapp_format(response.json()["choices"][0]["message"]["content"])
    await send(chat, reply)

    # Saved as a user/assistant pair only after a successful reply, so the window always starts on a user turn.
    db.executemany(
        "INSERT INTO messages (sender, role, content) VALUES (?, ?, ?)",
        [(chat, "user", text), (chat, "assistant", reply)],
    )
    db.execute(  # keep the last 10 messages per sender
        "DELETE FROM messages WHERE sender = ? AND id NOT IN "
        "(SELECT id FROM messages WHERE sender = ? ORDER BY id DESC LIMIT 10)",
        (chat, chat),
    )


def whatsapp_format(text):
    """Turn the Markdown models slip into anyway into WhatsApp formatting."""
    text = re.sub(r"^#{1,6}\s+\**(.+?)\**\s*$", r"*\1*", text, flags=re.M)  # ## Heading -> *Heading*
    text = re.sub(r"\*\*(.+?)\*\*", r"*\1*", text)  # **bold** -> *bold*
    return re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r"\1: \2", text)  # [text](url) -> text: url


async def send(chat, text):
    await call("POST", f"{WAHA_URL}/api/sendText", headers={"X-Api-Key": WAHA_API_KEY},
               json={"session": "default", "chatId": chat, "text": text})


async def call(method, url, **kwargs):
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.request(method, url, **kwargs)
    if r.is_error:
        raise RuntimeError(f"{method} {url} -> {r.status_code} {r.text}")
    return r
