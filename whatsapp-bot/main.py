import base64
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import sqlite3
import time
from urllib.parse import urlsplit

import httpx
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request

WAHA_URL = os.getenv("WAHA_URL", "http://localhost:3001")  # host port in docker-compose.yml
WAHA_API_KEY = os.environ["WAHA_API_KEY"]
WAHA_HMAC_KEY = os.environ["WAHA_HMAC_KEY"].encode()
if not WAHA_HMAC_KEY:
    raise RuntimeError("WAHA_HMAC_KEY is empty, so anyone could forge webhook signatures")
OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]
OPENROUTER_MODEL = os.environ["OPENROUTER_MODEL"]
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL_TIMEOUT_SECONDS = 60  # replies normally take 5-25 s; past this the patient should hear back anyway
VIDEO_CALL_URL = os.environ["VIDEO_CALL_URL"].rstrip("/")
# Shared with the web app, which reads a chat's context when a patient opens their video link.
HANDOFF_SECRET = os.getenv("HANDOFF_SECRET", "")
HANDOFF_TTL_SECONDS = 2 * 60 * 60
VIDEO_LINK = "VIDEO_LINK"  # the model writes this; each reply gets a link for that patient
SORRY = ("Sorry, I couldn't reply to that just now. Please send it again in a minute.\n"
         "Maazrat, abhi jawab nahi de saka. Thori dair baad dobara bhejein.")

INSTRUCTIONS = f"""You are Jamshed Khatri, a friendly AI doctor chatting with patients on WhatsApp.
Patients describe their symptoms in messages or voice notes and can send photos. Ask about their
symptoms, ask them to send a clear, well-lit photo of the affected area when it would help, describe
what you see, and explain what it might be in plain language. Ask follow-up questions like a real
doctor would. Then:
- Minor issue: suggest simple home care, common over-the-counter options (used as the pack says)
  and what to avoid, and when to see a doctor if it doesn't get better.
- Needs treatment: say which kind of doctor to see and how soon.
- Serious, unclear from a photo, or needs a closer look: invite them to a live video consultation.
  Put the exact text {VIDEO_LINK} on its own line where the link goes; it becomes their personal
  link, and the video doctor will already have read this chat. Never write any other link.
Keep replies short and conversational, like WhatsApp messages: usually under 100 words, a few
questions or tips at a time. Format for WhatsApp: *single asterisks* for bold, _underscores_ for
italics, "- " for bullet points and plain URLs; never use Markdown headings, **double asterisks**,
tables or [text](link) links. Reply in the patient's own
language and script: Urdu, Roman Urdu, English, Punjabi, Sindhi, Pashto, Saraiki, Balochi or any
other. Answer voice notes in the language spoken, in Roman script (e.g. Roman Urdu) unless they
type to you in another script; never use Devanagari. Never prescribe prescription-only medicines.
In your first reply, and whenever you say what something might be, say you are an AI and not a
substitute for an in-person doctor. Urge emergency care right away (call 1122 in Pakistan) for
red-flag symptoms such as chest pain, trouble breathing, heavy bleeding or thoughts of self-harm."""

log = logging.getLogger("uvicorn.error")
app = FastAPI()
db = sqlite3.connect(os.getenv("DB_PATH", "bot.db"), check_same_thread=False, isolation_level=None)
db.executescript("""
    CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, sender TEXT, role TEXT, content TEXT);
    CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS patients (sender TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE IF NOT EXISTS handoffs (token TEXT PRIMARY KEY, sender TEXT, created REAL);
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
        # Forget the message so a redelivery gets answered, and tell the patient instead of going quiet.
        db.execute("DELETE FROM seen WHERE id = ?", (msg.get("id"),))
        try:
            await send(msg["from"], SORRY)
        except Exception:
            log.exception("failed to send the apology for message %s", msg.get("id"))


async def reply_to(msg):
    chat = msg["from"]
    if msg.get("fromMe") or chat.endswith(("@g.us", "@broadcast", "@newsletter")):
        return  # only 1:1 chats: never answer in groups, status updates or channels
    # ponytail: `seen` gains a row per message forever; prune old ids if the db file ever gets big
    if db.execute("INSERT OR IGNORE INTO seen VALUES (?)", (msg["id"],)).rowcount == 0:
        return  # already handled this message id

    name = ((msg.get("_data") or {}).get("Info") or {}).get("PushName") or (msg.get("_data") or {}).get("notifyName")
    if name:
        db.execute("INSERT INTO patients VALUES (?, ?) ON CONFLICT(sender) DO UPDATE SET name = excluded.name",
                   (chat, name.strip()[:80]))

    text = content = msg.get("body") or ""
    if msg.get("hasMedia"):
        media = msg.get("media") or {}
        mimetype = media.get("mimetype") or ""
        kind = "photo" if mimetype.startswith("image/") else "voice note" if mimetype.startswith("audio/ogg") else None
        if not media.get("url") or not kind:  # videos, documents, other files
            await send(chat, "I can read text messages, photos and voice notes. Please send one of those.")
            return
        # fetch by path from our own WAHA, so the API key never goes to another host
        file = await call("GET", WAHA_URL + urlsplit(media["url"]).path, headers={"X-Api-Key": WAHA_API_KEY})
        data = base64.b64encode(file.content).decode()
        attachment = (
            {"type": "image_url", "image_url": {"url": f"data:{mimetype};base64,{data}"}}
            if kind == "photo"
            else {"type": "input_audio", "input_audio": {"data": data, "format": "ogg"}}  # voice notes are Ogg Opus
        )
        content = [{"type": "text", "text": text or f"({kind})"}, attachment]
        text = f"[{kind}] {text}".strip()  # history keeps a note of the photo or voice note, not the file
    elif not text:
        return  # no text and nothing attached, e.g. a system notice

    history = db.execute("SELECT role, content FROM messages WHERE sender = ? ORDER BY id", (chat,))
    messages = (
        [{"role": "system", "content": INSTRUCTIONS}]
        + [{"role": r, "content": c} for r, c in history]
        + [{"role": "user", "content": content}]
    )
    response = await call("POST", OPENROUTER_URL, headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
                          json={"model": OPENROUTER_MODEL, "messages": messages}, timeout=MODEL_TIMEOUT_SECONDS)
    reply = add_video_link(chat, whatsapp_format(response.json()["choices"][0]["message"]["content"]))
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


def add_video_link(chat, reply):
    """Swap the model's placeholder (or a bare app URL) for this patient's video link."""
    if VIDEO_LINK not in reply and VIDEO_CALL_URL not in reply:
        return reply
    token = secrets.token_urlsafe(12)
    db.execute("INSERT INTO handoffs VALUES (?, ?, ?)", (token, chat, time.time()))
    db.execute("DELETE FROM handoffs WHERE created < ?", (time.time() - HANDOFF_TTL_SECONDS,))
    link = f"{VIDEO_CALL_URL}/video?t={token}"
    reply = reply.replace(VIDEO_LINK, link)
    return re.sub(re.escape(VIDEO_CALL_URL) + r"(?!/video\?t=)[^\s]*", link, reply)


@app.get("/handoff/{token}")
async def handoff(token: str, x_handoff_key: str = Header(default="")):
    """Context for a video consult opened from WhatsApp. Only the web app's server calls this."""
    if not HANDOFF_SECRET or not hmac.compare_digest(x_handoff_key.encode(), HANDOFF_SECRET.encode()):
        raise HTTPException(403, "bad key")
    row = db.execute("SELECT sender, created FROM handoffs WHERE token = ?", (token,)).fetchone()
    if not row or row[1] < time.time() - HANDOFF_TTL_SECONDS:
        raise HTTPException(404, "unknown or expired link")
    sender = row[0]
    name = (db.execute("SELECT name FROM patients WHERE sender = ?", (sender,)).fetchone() or [""])[0]
    history = db.execute("SELECT role, content FROM messages WHERE sender = ? ORDER BY id", (sender,)).fetchall()
    return {
        "name": name,
        "phone": await phone_number(sender),
        "messages": [{"from": "patient" if r == "user" else "doctor", "text": c} for r, c in history],
    }


async def phone_number(chat):
    """+92... for a chat id. WhatsApp's private @lid ids are looked up through WAHA."""
    if chat.endswith("@c.us"):
        return "+" + chat.split("@")[0]
    try:
        r = await call("GET", f"{WAHA_URL}/api/default/lids/{chat.split('@')[0]}",
                       headers={"X-Api-Key": WAHA_API_KEY}, timeout=10)
        pn = r.json().get("pn") or ""
        return "+" + pn.split("@")[0] if pn else ""
    except Exception:
        return ""


def whatsapp_format(text):
    """Turn the Markdown models slip into anyway into WhatsApp formatting."""
    text = re.sub(r"^#{1,6}\s+\**(.+?)\**\s*$", r"*\1*", text, flags=re.M)  # ## Heading -> *Heading*
    text = re.sub(r"\*\*(.+?)\*\*", r"*\1*", text)  # **bold** -> *bold*
    return re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r"\1: \2", text)  # [text](url) -> text: url


async def send(chat, text):
    await call("POST", f"{WAHA_URL}/api/sendText", headers={"X-Api-Key": WAHA_API_KEY},
               json={"session": "default", "chatId": chat, "text": text})


async def call(method, url, timeout=120, **kwargs):
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.request(method, url, **kwargs)
    if r.is_error:
        raise RuntimeError(f"{method} {url} -> {r.status_code} {r.text}")
    return r
