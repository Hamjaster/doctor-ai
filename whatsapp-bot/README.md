# WhatsApp extension: Jamshed Khatri, AI doctor

A WhatsApp front door for the video doctor in this repo. Patients message a WhatsApp number, describe their symptoms in text or voice notes, and can send photos. Jamshed Khatri, an AI doctor running on Gemini through OpenRouter, asks follow-up questions and then:

- suggests home care and what to avoid for minor issues;
- says which kind of doctor to see when it needs treatment;
- sends the link to the live video consultation for anything serious or unclear.

He remembers each patient's last 10 messages. He replies in the patient's own language and script: Urdu, Roman Urdu, English, Punjabi, Sindhi, Pashto and others.

It runs on [WAHA](https://waha.devlike.pro/), a free, self-hosted WhatsApp Web API, so you don't need Meta business verification or a public URL.

> **WAHA is unofficial.** It logs in the way WhatsApp Web does, which breaks WhatsApp's terms, so the linked number can be banned. Use a spare number.

## Setup

You need Python 3.9+ and Docker. Run everything from this folder.

1. **Install and configure**

   ```sh
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env
   ```

   In `.env`, fill in:
   - `OPENROUTER_API_KEY`: from https://openrouter.ai/keys
   - `VIDEO_CALL_URL`: where the video app is deployed
   - `WAHA_API_KEY`, `WAHA_HMAC_KEY` and `WAHA_DASHBOARD_PASSWORD`: three different random strings, e.g. from `openssl rand -hex 16`
   - `WAHA_TAG`: `latest` on Intel/AMD machines (the default, `arm`, is for Apple Silicon)

2. **Start WAHA and the bot**

   ```sh
   docker compose up -d
   uvicorn main:app --env-file .env --port 8000
   ```

3. **Link the WhatsApp number with a pairing code.** In a second terminal, run the commands below. Replace the number with the bot's own WhatsApp number, digits only.

   ```sh
   set -a; source .env; set +a
   curl -s -X POST http://localhost:3001/api/sessions -H "X-Api-Key: $WAHA_API_KEY" \
     -H "Content-Type: application/json" -d '{"name": "default", "start": true}'
   # wait about 5 seconds, then:
   curl -s -X POST http://localhost:3001/api/default/auth/request-code -H "X-Api-Key: $WAHA_API_KEY" \
     -H "Content-Type: application/json" -d '{"phoneNumber": "923001234567"}'
   ```

   On that phone, open WhatsApp → **Linked devices** → **Link a device** → **Link with phone number instead**, and enter the code. The `default` session should then show `WORKING` in the dashboard at http://localhost:3001/dashboard (user `admin`, password `WAHA_DASHBOARD_PASSWORD`).

4. **Try it.** From another phone, send the number a message, a photo or a voice note. Messages sent while the session is still syncing after linking don't get a reply.

## Notes

- **Instructions:** the doctor's instructions are `INSTRUCTIONS` in `main.py`. Replies are converted to WhatsApp formatting before they're sent.
- **Who gets replies:** only one-on-one chats. Groups, status updates and channels are ignored. Videos and documents get a "text, photos or voice notes only" reply.
- **Private data:** `sessions/` holds the WhatsApp login and `bot.db` holds patients' conversations. Both are gitignored; keep them private.
- **Self-check:** `python test_main.py` runs the whole flow offline, with no network or keys.
