#!/usr/bin/env bash
set -euo pipefail

SUPA_URL="https://hgzyypyqawcppivnghpr.supabase.co"
SVC_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhnenl5cHlxYXdjcHBpdm5naHByIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzA0NDE3MCwiZXhwIjoyMDk4NjIwMTcwfQ.U8lrNfsqklbAzYa0jmjo3wWPpWmFazWDeRY47kGhYBs"

PA_MAILBOX="0722b6a3-ae4a-414a-9442-250a6916630e"
PR_MAILBOX="d6e2e212-7131-4c61-8fe0-b6beeaead068"
MARKER="e2e-$(date +%s)"

# Helper: call Edge Function
send_email() {
  local from_mb="$1" to="$2" subject="$3" body="$4"
  curl -s -X POST "$SUPA_URL/functions/v1/send-email" \
    -H "Authorization: Bearer $SVC_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"mailbox_id\":\"$from_mb\",\"to\":[\"$to\"],\"subject\":\"$subject\",\"body_html\":\"$body\"}"
}

echo "=== E2E TEST: paakwesi@ -> prince@ -> paakwesi@ ==="

# 1. Baseline via direct SQL query (run separately)
echo "[1/5] Recording inbox baselines..."
echo "      Run baseline query: messages.mailbox_id = $PR_MAILBOX / $PA_MAILBOX with subject filter"

# 2. Send from paakwesi to prince
echo "[2/5] Sending email from paakwesi@ to prince@..."
RESULT=$(send_email "$PA_MAILBOX" "prince@frimpsoil.com.gh" "E2E test $MARKER" "<p>Marker: $MARKER</p>")
echo "      Send result: $RESULT"
if echo "$RESULT" | grep -q '"error"'; then
  echo "      ❌ Send failed"
  exit 1
fi
echo "      ✅ Send accepted"

# 3. Poll prince inbox for marker
poll_prince() {
  for i in $(seq 1 60); do
    sleep 5
    COUNT=$(python3 - <<PY
import urllib.request, json
req = urllib.request.Request(
  "$SUPA_URL/rest/v1/messages?select=id&mailbox_id=eq.$PR_MAILBOX&subject=ilike.*$MARKER*&limit=1",
  headers={"Authorization":"Bearer $SVC_KEY","apikey":"$SVC_KEY","Accept":"application/json"}
)
try:
  with urllib.request.urlopen(req, timeout=15) as r:
    data = json.loads(r.read().decode())
    print(len(data))
except Exception as e:
  print(0)
PY
)
    if [ "$COUNT" -gt 0 ]; then
      echo "      ✅ prince@ received message with marker $MARKER after $((i*5))s"
      return 0
    fi
  done
  return 1
}

echo "[3/5] Waiting for prince@ inbox via IMAP IDLE..."
if ! poll_prince; then
  echo "      ❌ Timed out waiting for prince@"
  exit 1
fi

# 4. Reply from prince to paakwesi
echo "[4/5] Sending reply from prince@ to paakwesi@..."
REPLY=$(send_email "$PR_MAILBOX" "paakwesi@frimpsoil.com.gh" "Re: E2E test $MARKER" "<p>Reply marker: $MARKER</p>")
echo "      Reply result: $REPLY"
if echo "$REPLY" | grep -q '"error"'; then
  echo "      ❌ Reply send failed"
  exit 1
fi
echo "      ✅ Reply accepted"

# 5. Poll paakwesi inbox for reply
poll_paakwesi() {
  for i in $(seq 1 60); do
    sleep 5
    COUNT=$(python3 - <<PY
import urllib.request, json
req = urllib.request.Request(
  "$SUPA_URL/rest/v1/messages?select=id&mailbox_id=eq.$PA_MAILBOX&subject=ilike.*$MARKER*&limit=1",
  headers={"Authorization":"Bearer $SVC_KEY","apikey":"$SVC_KEY","Accept":"application/json"}
)
try:
  with urllib.request.urlopen(req, timeout=15) as r:
    data = json.loads(r.read().decode())
    print(len(data))
except Exception as e:
  print(0)
PY
)
    if [ "$COUNT" -gt 0 ]; then
      echo "      ✅ paakwesi@ received reply with marker $MARKER after $((i*5))s"
      return 0
    fi
  done
  return 1
}

echo "[5/5] Waiting for paakwesi@ inbox via IMAP IDLE..."
if ! poll_paakwesi; then
  echo "      ❌ Timed out waiting for paakwesi@"
  exit 1
fi

echo ""
echo "🎉 End-to-end send/receive workflow PASSED"
