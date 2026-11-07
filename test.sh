#!/usr/bin/env bash
# ========================================================
# AI Lead Triage - Bash Test Script (curl-based)
# ========================================================

set -euo pipefail

TARGET_URL="${1:-http://localhost:5678/webhook/lead-triage}"
SECRET_KEY="${2:-replace_with_strong_webhook_secret_token}"

echo "===================================================="
echo "    AI Lead Triage Automation - Curl Test Suite     "
echo "===================================================="
echo "Target URL: ${TARGET_URL}"
echo ""

run_test() {
  local id="$1"
  local desc="$2"
  local header="$3"
  local data="$4"
  local expected_code="$5"

  echo "[$id] $desc"
  
  if [ -n "$header" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST "$TARGET_URL" \
      -H "Content-Type: application/json" \
      -H "$header" \
      -d "$data")
  else
    response=$(curl -s -w "\n%{http_code}" -X POST "$TARGET_URL" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -eq "$expected_code" ]; then
    echo "  ✔ PASS (HTTP $http_code)"
    echo "  Response: $body"
  else
    echo "  ✘ FAIL (Got HTTP $http_code, Expected $expected_code)"
    echo "  Response: $body"
  fi
  echo "----------------------------------------------------"
}

# 1. Valid Sales Lead
run_test "TC-01" "Valid Sales Lead" \
  "X-Webhook-Secret: $SECRET_KEY" \
  '{"name":"John Doe","email":"john@acme.com","message":"We are interested in buying your enterprise plan for 50 users."}' \
  200

# 2. Support High Urgency
run_test "TC-02" "High Urgency Support" \
  "X-Webhook-Secret: $SECRET_KEY" \
  '{"name":"Sarah Connor","email":"sarah@skynet.com","message":"URGENT: Server outage on production cluster, all customers impacted!"}' \
  200

# 3. Spam Trigger
run_test "TC-03" "Spam Keyword Shortcut" \
  "X-Webhook-Secret: $SECRET_KEY" \
  '{"name":"Spam Guy","email":"spam@promo.cc","message":"Claim your casino bonus and guaranteed SEO backlinks package now!"}' \
  200

# 4. Missing Fields
run_test "TC-04" "Missing Fields (Empty Body)" \
  "X-Webhook-Secret: $SECRET_KEY" \
  '{}' \
  400

# 5. Invalid Email
run_test "TC-05" "Invalid Email Format" \
  "X-Webhook-Secret: $SECRET_KEY" \
  '{"name":"Alice","email":"invalid-email","message":"Hello there, testing validation."}' \
  400

# 6. Short Message
run_test "TC-06" "Short Message Below Limit" \
  "X-Webhook-Secret: $SECRET_KEY" \
  '{"name":"Bob","email":"bob@example.com","message":"Yo"}' \
  400

# 7. Missing Auth Header
run_test "TC-07" "Missing Secret Header" \
  "" \
  '{"name":"Eve","email":"eve@hacker.io","message":"Trying without auth header."}' \
  401

# 8. Invalid Auth Header
run_test "TC-08" "Invalid Secret Header" \
  "X-Webhook-Secret: wrong_key" \
  '{"name":"Eve","email":"eve@hacker.io","message":"Trying with invalid key."}' \
  401

# 9. Idempotency Test
run_test "TC-09" "Idempotency Duplicate Submission" \
  "X-Webhook-Secret: $SECRET_KEY" \
  '{"name":"John Doe","email":"john@acme.com","message":"We are interested in buying your enterprise plan for 50 users."}' \
  200

echo ""
echo "Test execution complete!"
