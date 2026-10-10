"""Talk to the WhatsApp bot in the terminal, without WhatsApp or WAHA.

Runs the bot's real reply code (instructions, model, memory) and prints replies instead of
sending them. Type a message and press Enter. Send a file with:
  /photo path/to/image.jpg   optional caption after the path
  /voice path/to/note.ogg    Ogg Opus, like a WhatsApp voice note
  /quit
Usage: .venv/bin/python chat_local.py
"""
import asyncio, mimetypes, os, sys, types, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
for line in open(os.path.join(HERE, ".env")):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        os.environ.setdefault(k, v)
os.environ["DB_PATH"] = os.path.join(HERE, "chat_local.db")  # separate from the real bot's history
sys.path.insert(0, HERE)
import main  # noqa: E402

files = {}
real_call = main.call


async def call(method, url, **kw):
    path = "/" + url.split("/", 3)[3] if url.count("/") >= 3 else url
    if method == "GET" and path in files:
        return types.SimpleNamespace(content=files[path])
    return await real_call(method, url, **kw)


async def send(chat, text):
    print(f"\nBot: {text}\n")


main.call, main.send = call, send
ME = "local-test@c.us"


async def chat():
    print("Chatting with the WhatsApp bot. /photo <file> [caption], /voice <file>, /quit\n")
    while True:
        try:
            line = (await asyncio.to_thread(input, "You: ")).strip()
        except EOFError:
            break
        if not line:
            continue
        if line == "/quit":
            break
        msg = {"id": uuid.uuid4().hex, "from": ME, "fromMe": False, "body": line, "hasMedia": False}
        if line.startswith(("/photo ", "/voice ")):
            kind, rest = line.split(" ", 1)
            path, _, caption = rest.strip().partition(" ")
            path = os.path.expanduser(path)
            if not os.path.isfile(path):
                print(f"No such file: {path}\n")
                continue
            mime = "audio/ogg; codecs=opus" if kind == "/voice" else mimetypes.guess_type(path)[0] or "image/jpeg"
            files[f"/api/files/{msg['id']}"] = open(path, "rb").read()
            msg.update(body=caption, hasMedia=True,
                       media={"url": f"http://localhost/api/files/{msg['id']}", "mimetype": mime})
        print("(thinking...)")
        await main.handle(msg)


asyncio.run(chat())
