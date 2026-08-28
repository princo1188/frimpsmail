#!/usr/bin/env bash
set -euo pipefail

# This test intentionally requires explicit target values. Never add live
# credentials or production mailbox identifiers to this file.
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"
: "${E2E_USER_ACCESS_TOKEN:?E2E_USER_ACCESS_TOKEN is required}"
: "${E2E_SENDER_MAILBOX_ID:?E2E_SENDER_MAILBOX_ID is required}"
: "${E2E_RECIPIENT_MAILBOX_ID:?E2E_RECIPIENT_MAILBOX_ID is required}"
: "${E2E_SENDER_EMAIL:?E2E_SENDER_EMAIL is required}"
: "${E2E_RECIPIENT_EMAIL:?E2E_RECIPIENT_EMAIL is required}"

marker="e2e-$(date +%s)"

send_email() {
  local mailbox_id="$1" recipient="$2" subject="$3"
  curl --fail-with-body --silent --show-error \
    -X POST "$SUPABASE_URL/functions/v1/send-email" \
    -H "Authorization: Bearer $E2E_USER_ACCESS_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "{\"mailbox_id\":\"$mailbox_id\",\"to\":[\"$recipient\"],\"subject\":\"$subject\",\"body_html\":\"<p>Marker: $marker</p>\"}"
}

wait_for_message() {
  local mailbox_id="$1"
  for _ in $(seq 1 60); do
    count=$(curl --fail-with-body --silent --show-error \
      "$SUPABASE_URL/rest/v1/messages?select=id&mailbox_id=eq.$mailbox_id&subject=ilike.*$marker*&limit=1" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" | grep -c '"id"' || true)
    if [ "$count" -gt 0 ]; then return 0; fi
    sleep 5
  done
  return 1
}

echo "Sending $E2E_SENDER_EMAIL -> $E2E_RECIPIENT_EMAIL"
send_email "$E2E_SENDER_MAILBOX_ID" "$E2E_RECIPIENT_EMAIL" "E2E test $marker"
wait_for_message "$E2E_RECIPIENT_MAILBOX_ID"

echo "Sending $E2E_RECIPIENT_EMAIL -> $E2E_SENDER_EMAIL"
send_email "$E2E_RECIPIENT_MAILBOX_ID" "$E2E_SENDER_EMAIL" "Re: E2E test $marker"
wait_for_message "$E2E_SENDER_MAILBOX_ID"

echo "End-to-end send/receive workflow passed"
