"""Upload local pornhwa-export.json to Supabase Storage (one-time, for Render bootstrap)."""

from __future__ import annotations

import sys
from pathlib import Path

from supabase import create_client

DEFAULT_BUCKET = "otakuvault-private"
DEFAULT_OBJECT = "pornhwa-export.json"


def main() -> int:
    backend_root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend_root))
    from app.core.config import settings

    url = settings.supabase_url.strip()
    key = settings.supabase_service_role_key.strip()
    if not url or not key:
        print("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env", file=sys.stderr)
        return 1

    export_path = backend_root / "data" / "pornhwa-export.json"
    if not export_path.is_file():
        print(f"Missing {export_path}", file=sys.stderr)
        return 1

    bucket = (settings.pornhwadb_storage_bucket or DEFAULT_BUCKET).strip() or DEFAULT_BUCKET
    object_path = (settings.pornhwadb_storage_object or DEFAULT_OBJECT).strip() or DEFAULT_OBJECT

    client = create_client(url, key)
    storage = client.storage

    try:
        storage.get_bucket(bucket)
    except Exception:
        storage.create_bucket(bucket, options={"public": False})

    data = export_path.read_bytes()
    storage.from_(bucket).upload(
        object_path,
        data,
        file_options={"content-type": "application/json", "upsert": "true"},
    )

    print(f"Uploaded {export_path.name} ({len(data):,} bytes) → {bucket}/{object_path}")
    print("On Render, set env:")
    print(f"  PORNHWADB_STORAGE_BUCKET={bucket}")
    print(f"  PORNHWADB_STORAGE_OBJECT={object_path}")
    print("Redeploy the API — it downloads the file on startup.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
