"""
Show what is stored server-side for an account (shelf items + synced preferences).

Usage (PowerShell):
    $env:CHECK_EMAIL="you@example.com"; $env:CHECK_PASSWORD="..."; python scripts/check_account.py
"""

import json
import os
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_env(path: Path) -> dict:
    env = {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def call(url: str, key: str, token: str | None = None, body: dict | None = None) -> dict | list:
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read())


def main() -> int:
    env = load_env(ROOT / "frontend" / ".env.local")
    url, key = env["VITE_SUPABASE_URL"].rstrip("/"), env["VITE_SUPABASE_ANON_KEY"]
    email, password = os.environ.get("CHECK_EMAIL"), os.environ.get("CHECK_PASSWORD")
    if not email or not password:
        print("Set CHECK_EMAIL and CHECK_PASSWORD env vars.")
        return 1

    auth = call(f"{url}/auth/v1/token?grant_type=password", key, body={"email": email, "password": password})
    token, user = auth["access_token"], auth["user"]
    print(f"Logged in as {user['email']} (id {user['id'][:8]}…)")

    items = call(f"{url}/rest/v1/media_items?select=title,media_type,status&order=created_at.desc", key, token)
    by_type: dict[str, int] = {}
    for i in items:
        by_type[i["media_type"]] = by_type.get(i["media_type"], 0) + 1
    print(f"\nShelf items in database: {len(items)}  {by_type}")

    prefs = (user.get("user_metadata") or {}).get("vault_prefs")
    print("\nSynced preferences (account):")
    if not prefs:
        print("  none — content mode, 18+ flags and watch links exist only in each browser's localStorage")
    else:
        print(f"  content mode : {prefs.get('contentMode', 'creamy')}")
        print(f"  18+ flags    : {len(prefs.get('adultOverrides', {}))}")
        print(f"  watch links  : {len(prefs.get('watchLinks', {}))}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
