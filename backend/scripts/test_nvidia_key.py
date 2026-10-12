"""Script to test and verify NVIDIA API Key for chat and embeddings."""

import os
import sys
import httpx
from pathlib import Path
from dotenv import load_dotenv

# Ensure UTF-8 output on Windows consoles
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Load backend/.env
env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

api_key = sys.argv[1].strip() if len(sys.argv) > 1 else os.getenv("NVIDIA_API_KEY", "").strip()

if not api_key:
    print("\n[!] NVIDIA_API_KEY is not set or empty in backend/.env!")
    print("Please paste your NVIDIA API key into backend/.env:")
    print("   NVIDIA_API_KEY=nvapi-...")
    sys.exit(1)

masked_key = api_key[:8] + "..." + api_key[-4:] if len(api_key) > 12 else "***"
print(f"\n[*] Testing NVIDIA API Key: {masked_key}")

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

# 1. Test Chat Completion
print("\n[1] Testing Chat Completion (nvidia/nemotron-3.5-lightning-30b-a3b)...")
chat_url = "https://integrate.api.nvidia.com/v1/chat/completions"
chat_payload = {
    "model": "nvidia/nemotron-3.5-lightning-30b-a3b",
    "messages": [{"role": "user", "content": "Reply with 'PONG' only."}],
    "max_tokens": 50,
    "temperature": 0.1,
    "chat_template_kwargs": {"enable_thinking": False},
}

chat_ok = False
try:
    with httpx.Client(timeout=30.0) as client:
        res = client.post(chat_url, headers=headers, json=chat_payload)
        if res.status_code == 200:
            data = res.json()
            reply = data.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
            print(f"    [OK] Chat API working! Model responded: {repr(reply)}")
            chat_ok = True
        else:
            print(f"    [FAIL] Chat API returned status {res.status_code}: {res.text}")
except Exception as e:
    print(f"    [FAIL] Chat API connection error: {e}")

# 2. Test Embeddings
print("\n[2] Testing Embeddings (nvidia/nemotron-3-embed-1b)...")
embed_url = "https://integrate.api.nvidia.com/v1/embeddings"
embed_payload = {
    "input": ["OtakuVault anime library search"],
    "model": "nvidia/nemotron-3-embed-1b",
    "input_type": "query",
}

embed_ok = False
try:
    with httpx.Client(timeout=30.0) as client:
        res = client.post(embed_url, headers=headers, json=embed_payload)
        if res.status_code == 200:
            data = res.json()
            embedding = data.get("data", [{}])[0].get("embedding", [])
            print(f"    [OK] Embeddings working! Dimension: {len(embedding)}")
            embed_ok = True
        else:
            print(f"    [FAIL] Embeddings API returned status {res.status_code}: {res.text}")
except Exception as e:
    print(f"    [FAIL] Embeddings API connection error: {e}")

print("\n" + "=" * 45)
if chat_ok and embed_ok:
    print("[SUCCESS] All NVIDIA API endpoints are ACTIVE and ready!")
else:
    print("[WARNING] One or more tests did not succeed. Check the errors above.")
print("=" * 45 + "\n")
