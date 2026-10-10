"""
Check deploy environment variables and build copy-paste files for Render and Vercel.

Usage (from the repo root):
    python scripts/deploy_env.py                     # masked checklist only
    python scripts/deploy_env.py --write             # also write deploy-env/render.env and deploy-env/vercel.env
    python scripts/deploy_env.py --write --render-url https://otakuvalult.onrender.com --vercel-url https://otaku-valult.vercel.app

Then on Render:  Environment -> "Add from .env" -> paste deploy-env/render.env
     on Vercel:  Settings -> Environment Variables -> paste deploy-env/vercel.env (Vercel accepts pasted .env text)

deploy-env/ is git-ignored. Delete it after deploying.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_ENV = ROOT / "backend" / ".env"
FRONTEND_ENV = ROOT / "frontend" / ".env.local"
OUT_DIR = ROOT / "deploy-env"

WHERE = {
    "SUPABASE_URL": "Supabase > Project Settings > Data API (or API) > Project URL",
    "SUPABASE_SERVICE_ROLE_KEY": "Supabase > Project Settings > API Keys > service_role (Reveal) / Secret key",
    "SUPABASE_JWT_SECRET": "Supabase > Project Settings > JWT Keys > Legacy JWT Secret (Reveal)",
    "VITE_SUPABASE_ANON_KEY": "Supabase > Project Settings > API Keys > anon public / Publishable key",
    "TMDB_API_KEY": "themoviedb.org > Settings > API > API Key",
    "NVIDIA_API_KEY": "build.nvidia.com (optional, not used by the live app yet)",
}

GREEN, RED, YELLOW, DIM, RESET = "\033[92m", "\033[91m", "\033[93m", "\033[2m", "\033[0m"


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        env[key.strip().upper()] = value.strip().strip('"').strip("'")
    return env


def mask(value: str) -> str:
    if not value:
        return "(empty)"
    if len(value) <= 12:
        return value[:2] + "…" + f" ({len(value)} chars)"
    return f"{value[:6]}…{value[-4:]} ({len(value)} chars)"


def jwt_payload(token: str) -> dict:
    try:
        part = token.split(".")[1]
        part += "=" * (-len(part) % 4)
        return json.loads(base64.urlsafe_b64decode(part))
    except Exception:
        return {}


def project_ref(url: str) -> str | None:
    m = re.match(r"https://([a-z0-9]+)\.supabase\.co/?$", url or "")
    return m.group(1) if m else None


def check_key_role(value: str, expected: str, ref: str | None) -> tuple[bool, str]:
    if not value:
        return False, "missing"
    if value.startswith("sb_secret_"):
        return expected == "service_role", "new-style secret key"
    if value.startswith("sb_publishable_"):
        return expected == "anon", "new-style publishable key"
    payload = jwt_payload(value)
    if not payload:
        return False, "not a valid JWT"
    role = payload.get("role")
    if role != expected:
        return False, f"role is '{role}', expected '{expected}' (wrong key pasted?)"
    if ref and payload.get("ref") and payload["ref"] != ref:
        return False, f"key belongs to project '{payload['ref']}', URL is '{ref}'"
    return True, f"role={role}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--write", action="store_true", help="write deploy-env/render.env and deploy-env/vercel.env")
    ap.add_argument("--render-url", default="", help="your Render backend URL (for VITE_API_URL)")
    ap.add_argument("--vercel-url", default="", help="your Vercel frontend URL (for FRONTEND_ORIGIN)")
    args = ap.parse_args()

    if sys.platform == "win32":
        import os
        os.system("")  # enable ANSI colors in Windows terminals

    be, fe = load_env(BACKEND_ENV), load_env(FRONTEND_ENV)
    print(f"{DIM}backend : {BACKEND_ENV} {'(found)' if be else '(MISSING)'}")
    print(f"frontend: {FRONTEND_ENV} {'(found)' if fe else '(MISSING)'}{RESET}\n")

    supa_url = be.get("SUPABASE_URL") or fe.get("VITE_SUPABASE_URL", "")
    ref = project_ref(supa_url)
    vercel_url = args.vercel_url.rstrip("/")
    render_url = args.render_url.rstrip("/")

    origins = ",".join(o for o in [vercel_url, "http://localhost:5173"] if o)

    render = {"PYTHON_VERSION": "3.12.4", "FRONTEND_ORIGIN": origins}
    for key in ("TMDB_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET", "NVIDIA_API_KEY"):
        if be.get(key):
            render[key] = be[key]

    vercel = {
        "VITE_SUPABASE_URL": fe.get("VITE_SUPABASE_URL") or be.get("SUPABASE_URL", ""),
        "VITE_SUPABASE_ANON_KEY": fe.get("VITE_SUPABASE_ANON_KEY", ""),
        "VITE_API_URL": render_url or "https://<your-render-service>.onrender.com",
    }

    problems = 0

    def row(key: str, value: str, ok: bool, note: str = "", secret: bool = True):
        nonlocal problems
        if not ok:
            problems += 1
        icon = f"{GREEN}✔{RESET}" if ok else f"{RED}✘{RESET}"
        shown = mask(value) if secret else (value or "(empty)")
        print(f"  {icon} {key:<28} {shown}")
        if note:
            print(f"      {YELLOW if not ok else DIM}{note}{RESET}")
        if not ok and key in WHERE:
            print(f"      {DIM}get it: {WHERE[key]}{RESET}")

    def optional(key: str, why: str):
        value = render.get(key, "")
        icon = f"{GREEN}✔{RESET}" if value else f"{DIM}–{RESET}"
        print(f"  {icon} {key:<28} {mask(value) if value else '(not set — ' + why + ')'}")
        if not value and key in WHERE:
            print(f"      {DIM}get it: {WHERE[key]}{RESET}")

    print("RENDER (backend) — required")
    row("PYTHON_VERSION", render["PYTHON_VERSION"], True, secret=False)
    row("FRONTEND_ORIGIN", origins, True,
        "" if vercel_url else "add your Vercel URL later with --vercel-url", secret=False)
    print("RENDER (backend) — optional")
    optional("TMDB_API_KEY", "movie/TV results are skipped, anime/manga still work")
    optional("SUPABASE_URL", "not used by backend code yet")
    optional("SUPABASE_SERVICE_ROLE_KEY", "not used by backend code yet")
    optional("SUPABASE_JWT_SECRET", "not used by backend code yet")
    optional("NVIDIA_API_KEY", "not used yet")
    if render.get("SUPABASE_SERVICE_ROLE_KEY"):
        ok, note = check_key_role(render["SUPABASE_SERVICE_ROLE_KEY"], "service_role", ref)
        if not ok:
            row("SUPABASE_SERVICE_ROLE_KEY", render["SUPABASE_SERVICE_ROLE_KEY"], ok, note)

    print("\nVERCEL (frontend) — 3 required")
    row("VITE_SUPABASE_URL", vercel["VITE_SUPABASE_URL"], bool(project_ref(vercel["VITE_SUPABASE_URL"])), secret=False)
    ok, note = check_key_role(vercel["VITE_SUPABASE_ANON_KEY"], "anon", ref)
    row("VITE_SUPABASE_ANON_KEY", vercel["VITE_SUPABASE_ANON_KEY"], ok, note)
    row("VITE_API_URL", vercel["VITE_API_URL"], bool(render_url),
        "" if render_url else "pass --render-url after Render is live", secret=False)

    if vercel["VITE_SUPABASE_ANON_KEY"] and vercel["VITE_SUPABASE_ANON_KEY"] == render.get("SUPABASE_SERVICE_ROLE_KEY"):
        print(f"\n  {RED}DANGER: anon key equals service_role key. Never put service_role in the frontend.{RESET}")
        problems += 1

    if args.write:
        OUT_DIR.mkdir(exist_ok=True)
        (OUT_DIR / "render.env").write_text("\n".join(f"{k}={v}" for k, v in render.items()) + "\n", encoding="utf-8")
        (OUT_DIR / "vercel.env").write_text("\n".join(f"{k}={v}" for k, v in vercel.items()) + "\n", encoding="utf-8")
        print(f"\n{GREEN}Wrote{RESET} {OUT_DIR / 'render.env'}  -> Render: Environment > Add from .env > paste")
        print(f"{GREEN}Wrote{RESET} {OUT_DIR / 'vercel.env'}  -> Vercel: Settings > Environment Variables > paste")
        print(f"{DIM}(git-ignored; delete the folder after deploying){RESET}")

    print()
    if problems:
        print(f"{RED}{problems} problem(s) found. Fix them in backend/.env or frontend/.env.local and run again.{RESET}")
        return 1
    print(f"{GREEN}All good.{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
