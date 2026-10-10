#!/usr/bin/env bash
# Link a WhatsApp number to WAHA with a pairing code, retrying with a fresh code when one expires.
# Usage: ./link_whatsapp.sh 923213085273   (the bot's own number, digits only)
set -euo pipefail
cd "$(dirname "$0")"
NUMBER="${1:?usage: ./link_whatsapp.sh <number, digits only>}"
set -a; source .env; set +a
API="http://localhost:3001/api"; H=(-H "X-Api-Key: $WAHA_API_KEY" -H "Content-Type: application/json")
status() { curl -s "$API/sessions/default" "${H[@]}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || true; }

curl -s -o /dev/null -X POST "$API/sessions" "${H[@]}" -d '{"name": "default", "start": false}' || true
for attempt in 1 2 3 4 5; do
  curl -s -o /dev/null -X POST "$API/sessions/default/restart" "${H[@]}"
  for _ in $(seq 1 30); do [ "$(status)" = "SCAN_QR_CODE" ] && break; sleep 1; done
  CODE=$(curl -s -X POST "$API/default/auth/request-code" "${H[@]}" -d "{\"phoneNumber\": \"$NUMBER\"}" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('code',''))")
  echo
  echo "  Pairing code: $CODE"
  echo "  On +$NUMBER: WhatsApp > Settings > Linked devices > Link a device > Link with phone number instead"
  echo "  Waiting for you to enter it..."
  while true; do
    S=$(status)
    case "$S" in
      WORKING) echo; echo "  Linked. Wait a minute for WhatsApp to sync, then message +$NUMBER from another account."; exit 0 ;;
      FAILED|STOPPED) echo "  That code expired. Getting a new one (attempt $((attempt + 1)) of 5)..."; break ;;
    esac
    sleep 3
  done
done
echo "Gave up after 5 codes. Run the script again when the phone is ready."; exit 1
