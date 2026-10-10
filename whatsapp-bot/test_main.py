"""Offline self-check, no network or real keys needed: python test_main.py"""
import functools
import hashlib
import hmac
import json
import os

import httpx

os.environ.update(
    WAHA_API_KEY="waha-key", WAHA_HMAC_KEY="shh", OPENROUTER_API_KEY="or-key",
    OPENROUTER_MODEL="test/model", VIDEO_CALL_URL="https://video.example", DB_PATH=":memory:",
    HANDOFF_SECRET="handoff-key",
)
import main  # noqa: E402  (reads the env at import)
from fastapi.testclient import TestClient  # noqa: E402

USER = "15550001111@c.us"
OPENROUTER, SEND = "https://openrouter.ai/api/v1/chat/completions", "http://localhost:3001/api/sendText"
SYSTEM = {"role": "system", "content": main.INSTRUCTIONS}
calls = []  # (url, auth header, json body) for every outbound API call
fail_once = {"boom"}  # user texts the model fails on the first time it sees them


def fake_api(request):
    if request.method == "GET" and "/lids/" in str(request.url):  # WAHA mapping a private id to a number
        return httpx.Response(200, json={"lid": "77@lid", "pn": "923001112222@c.us"})
    if request.method == "GET":  # WAHA serving a downloaded photo
        calls.append((str(request.url), request.headers.get("x-api-key"), None))
        return httpx.Response(200, content=b"img")
    body = json.loads(request.content)
    calls.append((str(request.url), request.headers.get("authorization") or request.headers.get("x-api-key"), body))
    if request.url.host == "openrouter.ai":  # echo the latest user text
        last = body["messages"][-1]["content"]
        if isinstance(last, str) and last in fail_once:
            fail_once.discard(last)
            return httpx.Response(503, json={"error": "overloaded"})
        text = last if isinstance(last, str) else last[0]["text"]
        if text == "need video":  # the model inviting the patient to a video consult
            return httpx.Response(200, json={"choices": [{"message": {"content": "Video par dikhayein:\nVIDEO_LINK"}}]})
        return httpx.Response(200, json={"choices": [{"message": {"content": "re: " + text}}]})
    return httpx.Response(201, json={"id": "sent"})


httpx.AsyncClient = functools.partial(httpx.AsyncClient, transport=httpx.MockTransport(fake_api))
client = TestClient(main.app)


def deliver(msg_id, text="hi", chat=USER, key="shh", event="message", **payload):
    payload = {"id": msg_id, "from": chat, "fromMe": False, "body": text, "hasMedia": False, **payload}
    body = json.dumps({"event": event, "session": "default", "payload": payload}).encode()
    sig = hmac.new(key.encode(), body, hashlib.sha512).hexdigest()
    return client.post("/webhook", content=body, headers={"X-Webhook-Hmac": sig, "X-Webhook-Hmac-Algorithm": "sha512"})


def test_bot():
    assert "Jamshed Khatri" in main.INSTRUCTIONS and "VIDEO_LINK" in main.INSTRUCTIONS
    assert "https://video.example" not in main.INSTRUCTIONS  # links are per patient, added after

    # forged or missing signature: rejected, nothing processed
    assert deliver("m0", key="wrong").status_code == 403
    assert client.post("/webhook", content=b"{}").status_code == 403
    assert calls == []

    # text -> OpenRouter (doctor instructions first) -> WAHA, each secret only to its own host; a redelivery is ignored
    assert deliver("m1").status_code == 200
    assert deliver("m1").status_code == 200
    assert calls == [
        (OPENROUTER, "Bearer or-key", {"model": "test/model", "messages": [SYSTEM, {"role": "user", "content": "hi"}]}),
        (SEND, "waha-key", {"session": "default", "chatId": USER, "text": "re: hi"}),
    ]

    # groups, status updates, channels, own messages, empty notices and other events: ignored
    for i, kw in enumerate([{"chat": "123@g.us"}, {"chat": "status@broadcast"}, {"chat": "1@newsletter"},
                            {"fromMe": True}, {"text": ""}, {"event": "message.ack"}]):
        assert deliver(f"x{i}", **kw).status_code == 200
    assert len(calls) == 2

    # photo: fetched from our own WAHA (whatever host media.url names), sent to the model with its caption
    deliver("p1", text="rash on my arm", hasMedia=True,
            media={"url": "http://elsewhere.example/api/files/p1.jpg", "mimetype": "image/jpeg"})
    assert calls[2] == ("http://localhost:3001/api/files/p1.jpg", "waha-key", None)
    assert calls[3][2]["messages"][-1]["content"] == [
        {"type": "text", "text": "rash on my arm"},
        {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64,aW1n"}},
    ]
    assert calls[4][2]["text"] == "re: rash on my arm"
    assert main.db.execute("SELECT content FROM messages WHERE role = 'user' ORDER BY id DESC").fetchone()[0] == \
        "[photo] rash on my arm"

    # voice note: fetched the same way and sent to the model as audio
    deliver("v1", text="", hasMedia=True,
            media={"url": "http://localhost:3000/api/files/v1.oga", "mimetype": "audio/ogg; codecs=opus"})
    assert calls[5] == ("http://localhost:3001/api/files/v1.oga", "waha-key", None)
    assert calls[6][2]["messages"][-1]["content"] == [
        {"type": "text", "text": "(voice note)"},
        {"type": "input_audio", "input_audio": {"data": "aW1n", "format": "ogg"}},
    ]
    assert calls[7][2]["text"] == "re: (voice note)"
    assert main.db.execute("SELECT content FROM messages WHERE role = 'user' ORDER BY id DESC").fetchone()[0] == \
        "[voice note]"
    assert all(lang in main.INSTRUCTIONS for lang in ("Urdu", "Punjabi", "Sindhi", "Pashto"))

    # video: polite reply, nothing downloaded, no LLM call
    deliver("d1", text="", hasMedia=True, media={"url": "http://localhost:3000/api/files/d1.mp4", "mimetype": "video/mp4"})
    assert len(calls) == 9 and "text messages, photos and voice notes" in calls[-1][2]["text"]

    # Markdown from the model is turned into WhatsApp formatting before it's sent
    assert main.whatsapp_format("## **Tips**\n#1 rest\n**Rest** well, see [a doctor](https://video.example)") == \
        "*Tips*\n#1 rest\n*Rest* well, see a doctor: https://video.example"
    deliver("f1", text="**Rest** well")
    assert len(calls) == 11 and calls[-1][2]["text"] == "re: *Rest* well"

    # memory: the model gets the instructions + last 10 stored messages (starting on a user turn) + the new one
    for i in range(10):
        deliver(f"q{i}", text=f"q{i}")
    sent = calls[-2][2]["messages"]
    assert len(sent) == 12 and sent[0] == SYSTEM and sent[1] == {"role": "user", "content": "q4"}
    assert sent[-1]["content"] == "q9"
    assert main.db.execute("SELECT COUNT(*) FROM messages").fetchone()[0] == 10

    # model fails: the patient gets an apology, nothing is stored, and a redelivery is answered
    before = len(calls)
    deliver("b1", text="boom")
    assert calls[before][0] == OPENROUTER and calls[before + 1][0] == SEND
    assert calls[before + 1][2]["text"] == main.SORRY
    assert main.db.execute("SELECT COUNT(*) FROM messages WHERE content = 'boom'").fetchone()[0] == 0
    deliver("b1", text="boom")
    assert calls[-1][2]["text"] == "re: boom"

    # video invite: the placeholder becomes a personal link that hands this chat to the video consult
    deliver("h1", text="need video", chat="77@lid", _data={"Info": {"PushName": "Ayesha"}})
    sent = calls[-1][2]["text"]
    assert "VIDEO_LINK" not in sent and "https://video.example/video?t=" in sent
    token = sent.split("?t=")[1].split()[0]
    assert client.get(f"/handoff/{token}").status_code == 403
    assert client.get(f"/handoff/{token}", headers={"X-Handoff-Key": "wrong"}).status_code == 403
    assert client.get("/handoff/nope", headers={"X-Handoff-Key": "handoff-key"}).status_code == 404
    ctx = client.get(f"/handoff/{token}", headers={"X-Handoff-Key": "handoff-key"}).json()
    assert ctx["name"] == "Ayesha" and ctx["phone"] == "+923001112222"
    assert ctx["messages"] == [{"from": "patient", "text": "need video"}, {"from": "doctor", "text": sent}]


if __name__ == "__main__":
    test_bot()
    print("ok")
