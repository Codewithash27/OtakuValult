# PornhwaDB export (local)

Copy your **`pornhwa-export.json`** here as:

```text
backend/data/pornhwa-export.json
```

The file is **not** committed to git (large + adult metadata). After copying:

- Local: restart `uvicorn`
- **Render (recommended):** one-time upload to Supabase Storage, then env on the API:
  ```bash
  cd backend
  python scripts/upload_pornhwadb_export.py
  ```
  Set `PORNHWADB_STORAGE_BUCKET=otakuvault-private` and `PORNHWADB_STORAGE_OBJECT=pornhwa-export.json` on Render, redeploy — the API downloads the file on startup.
- Or set `PORNHWADB_DATA_URL` to any HTTPS URL of the JSON file.
- Or Render **Secret File** mounted at a path and `PORNHWADB_DATA_PATH` pointing to it.

**Top rated (Creamy UI):** `backend/data/top-rated-slugs.json` is the fixed PornhwaDB top‑100 order (#1 Moby Dick … #100 KING Of The NIGHT). Rankings use export metadata for covers/scores.

**Add to list:** run Supabase migration `supabase/migrations/20261011000003_media_pornhwadb_source.sql` once so `source = pornhwadb` is allowed on `media_items`.

API: `GET /api/pornhwadb/status`, `/api/pornhwadb/charts?sort=top-rated`, `/api/pornhwadb/search?q=…`, `/api/pornhwadb/series/{slug}`

This provides **catalogue search, descriptions, and cover art** — not full chapter pages.
