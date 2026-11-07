#!/usr/bin/env python3
"""
AI Lead Triage - Automated Test Suite
Executes 8+ comprehensive test scenarios against the n8n webhook endpoint.

Usage:
    python test_triage.py [--url http://localhost:5678/webhook/lead-triage] [--secret test_secret]
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
import json
import argparse
import urllib.request
import urllib.error
import time

DEFAULT_URL = "http://localhost:5678/webhook/lead-triage"
DEFAULT_SECRET = "replace_with_strong_webhook_secret_token"

# ANSI Colors for terminal output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def send_request(url: str, payload: dict = None, headers: dict = None) -> tuple[int, dict, float]:
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=req_headers, method="POST")
    
    start_time = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            duration = round((time.time() - start_time) * 1000, 2)
            res_body = response.read().decode("utf-8")
            try:
                parsed_json = json.loads(res_body)
            except Exception:
                parsed_json = {"raw": res_body}
            return response.status, parsed_json, duration
    except urllib.error.HTTPError as e:
        duration = round((time.time() - start_time) * 1000, 2)
        err_body = e.read().decode("utf-8")
        try:
            parsed_json = json.loads(err_body)
        except Exception:
            parsed_json = {"raw": err_body}
        return e.code, parsed_json, duration
    except Exception as e:
        duration = round((time.time() - start_time) * 1000, 2)
        return 0, {"error": str(e)}, duration

def run_tests(target_url: str, secret_key: str):
    print(f"\n{BOLD}{CYAN}===================================================={RESET}")
    print(f"{BOLD}{CYAN}      AI Lead Triage Automation Test Suite         {RESET}")
    print(f"{BOLD}{CYAN}===================================================={RESET}")
    print(f"Target URL: {target_url}")
    print(f"Secret Key: {'*' * (len(secret_key) - 4) + secret_key[-4:] if len(secret_key) > 4 else '***'}\n")

    auth_header = {"X-Webhook-Secret": secret_key}

    test_cases = [
        {
            "id": "TC-01",
            "name": "Valid Sales Lead (High Value Prospect)",
            "headers": auth_header,
            "payload": {
                "name": "Alice Johnson",
                "email": f"alice.corp.{int(time.time())}@enterprise.com",
                "message": "Hi, we are evaluating your enterprise tier for 250 seats. Can we schedule an executive demo this Thursday?"
            },
            "expected_status": 200,
            "validate": lambda res: res.get("status") == "success" and res.get("category") == "sales"
        },
        {
            "id": "TC-02",
            "name": "High Urgency Support Inquiry (Production Down)",
            "headers": auth_header,
            "payload": {
                "name": "Bob Martinez",
                "email": f"bob.support.{int(time.time())}@client.com",
                "message": "CRITICAL: Our production database API integration is returning 500 errors and our users are locked out! Need immediate help!"
            },
            "expected_status": 200,
            "validate": lambda res: res.get("status") == "success" and res.get("urgency") == "high"
        },
        {
            "id": "TC-03",
            "name": "Rule-Based Spam Shortcut (Keyword Filter)",
            "headers": auth_header,
            "payload": {
                "name": "Spam Bot",
                "email": f"promo.{int(time.time())}@spammer.xyz",
                "message": "Buy cheap viagra and boost guaranteed SEO backlinks package now! Claim your prize."
            },
            "expected_status": 200,
            "validate": lambda res: res.get("status") == "success" and res.get("category") == "spam"
        },
        {
            "id": "TC-04",
            "name": "Missing Required Fields (Empty Payload)",
            "headers": auth_header,
            "payload": {},
            "expected_status": 400,
            "validate": lambda res: "details" in res and len(res["details"]) >= 2
        },
        {
            "id": "TC-05",
            "name": "Invalid Email Address Format",
            "headers": auth_header,
            "payload": {
                "name": "Charlie Chaplin",
                "email": "not-an-email-at-all",
                "message": "Hello, I am inquiring about consulting services."
            },
            "expected_status": 400,
            "validate": lambda res: any("email" in err.lower() for err in res.get("details", []))
        },
        {
            "id": "TC-06",
            "name": "Message Field Below Minimum Length",
            "headers": auth_header,
            "payload": {
                "name": "Dave",
                "email": "dave@test.com",
                "message": "Hi"
            },
            "expected_status": 400,
            "validate": lambda res: any("message" in err.lower() for err in res.get("details", []))
        },
        {
            "id": "TC-07",
            "name": "Unauthorized Webhook Call (Missing Secret Header)",
            "headers": {},
            "payload": {
                "name": "Eve Hacker",
                "email": "eve@shadow.org",
                "message": "Attempting unauthorized submission to webhook."
            },
            "expected_status": 401,
            "validate": lambda res: res.get("error") == "Unauthorized"
        },
        {
            "id": "TC-08",
            "name": "Unauthorized Webhook Call (Invalid Secret Key)",
            "headers": {"X-Webhook-Secret": "wrong_secret_123"},
            "payload": {
                "name": "Eve Hacker",
                "email": "eve@shadow.org",
                "message": "Attempting invalid key submission."
            },
            "expected_status": 401,
            "validate": lambda res: res.get("error") == "Unauthorized"
        },
        {
            "id": "TC-09",
            "name": "Idempotency Test (Duplicate Submission Ignored)",
            "headers": auth_header,
            "payload": {
                "name": "Franklin Roose",
                "email": "franklin.idempotent@sample.com",
                "message": "This is a recurring static message designed to test database deduplication."
            },
            "is_duplicate_test": True,
            "expected_status": 200,
            "validate": lambda res: res.get("status") == "duplicate_ignored"
        }
    ]

    passed = 0
    failed = 0

    for tc in test_cases:
        tc_id = tc["id"]
        tc_name = tc["name"]
        print(f"{BOLD}[{tc_id}] {tc_name}{RESET}")

        if tc.get("is_duplicate_test"):
            # First submission (primes the DB)
            send_request(target_url, tc["payload"], tc["headers"])
            time.sleep(1)
            # Second submission (should trigger idempotency guard)
            status, body, duration = send_request(target_url, tc["payload"], tc["headers"])
        else:
            status, body, duration = send_request(target_url, tc["payload"], tc["headers"])

        status_ok = (status == tc["expected_status"])
        validator = tc.get("validate")
        content_ok = validator(body) if validator else True

        if status_ok and content_ok:
            print(f"  {GREEN}✔ PASS{RESET} | HTTP {status} | Duration: {duration}ms")
            print(f"  Response: {json.dumps(body, indent=2)}")
            passed += 1
        else:
            print(f"  {RED}✘ FAIL{RESET} | Received HTTP {status} (Expected {tc['expected_status']}) | Duration: {duration}ms")
            print(f"  Response: {json.dumps(body, indent=2)}")
            failed += 1
        print("-" * 52)

    print(f"\n{BOLD}Test Summary:{RESET}")
    print(f"Total: {len(test_cases)} | {GREEN}Passed: {passed}{RESET} | {RED}Failed: {failed}{RESET}\n")
    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test Suite for AI Lead Triage Webhook")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Webhook target URL (default: {DEFAULT_URL})")
    parser.add_argument("--secret", default=DEFAULT_SECRET, help="Secret token for X-Webhook-Secret header")
    args = parser.parse_args()

    run_tests(args.url, args.secret)
