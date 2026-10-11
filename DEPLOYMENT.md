# OtakuVault — Deployment Guide

Live setup:

| Part | Host | Folder |
|---|---|---|
| Frontend (React + Vite) | **Vercel** | `frontend/` |
| Backend (FastAPI) | **Render** | `backend/` |
| Database + Auth | **Supabase** | `supabase/migrations/` |

```
Browser ──► Vercel (frontend) ──► Render (FastAPI /api/...) ──► AniList / TMDB
                 │
                 └──────────────► Supabase (auth + media_items table)
```

Repo: https://github.com/Codewithash27/OtakuValult

---

## 0. Before you start

Have these ready (all from your existing `backend/.env` and `frontend/.env.local`):

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` / `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key (**backend only, never in frontend**) |
| `SUPABASE_JWT_SECRET` | Supabase → Project Settings → API → JWT Settings → JWT Secret |
| `TMDB_API_KEY` | https://www.themoviedb.org/settings/api |
| `NVIDIA_API_KEY` | Optional |

> `.env` files are git-ignored and are **not** on GitHub. You paste the values into Render/Vercel dashboards instead. Templates: `backend/.env.example`, `frontend/.env.example`.

---

## 1. Supabase (database)

Skip if your tables already exist in the Supabase project.

1. Supabase dashboard → **SQL Editor**.
2. Run, in order:
   - `supabase/migrations/20261010000001_create_media_schema.sql`
   - `supabase/migrations/20261010000002_rls_and_grants.sql`
3. **Authentication → URL Configuration** (do this again after Vercel gives you a URL in step 3):
   - **Site URL**: `https://<your-app>.vercel.app`
   - **Redirect URLs**: add `https://<your-app>.vercel.app/**` and `http://localhost:5173/**`

---

## 2. Backend on Render

### Option A — Blueprint (uses `render.yaml`, fastest)

1. https://dashboard.render.com → **New → Blueprint**.
2. Connect GitHub → pick **Codewithash27/OtakuValult**.
3. Render reads `render.yaml` and creates **otakuvault-api**. It asks for the secret values — fill them in (see table below). For `FRONTEND_ORIGIN` put `http://localhost:5173` for now.
4. Click **Apply**. Wait for "Live".

### Option B — Manual web service

1. **New → Web Service** → connect the repo.
2. Settings:

| Field | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Python 3 |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/api/health` |
| Instance Type | Free |

3. **Environment** tab → add:

| Key | Value |
|---|---|
| `PYTHON_VERSION` | `3.12.4` **(required)** |
| `FRONTEND_ORIGIN` | `http://localhost:5173` (update in step 4) **(required)** |
| `TMDB_API_KEY` | optional — without it movie/TV search is skipped, anime/manga still work |
| `FRONTEND_ORIGIN_REGEX` | optional, see step 4 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `NVIDIA_API_KEY` | optional — not used by the backend code yet |

Tip: `python scripts/deploy_env.py --write` checks your local env files and writes ready-to-paste `deploy-env/render.env` and `deploy-env/vercel.env`.

4. **Create Web Service**.

### Check it

Open `https://otakuvault-api.onrender.com/api/health` (your URL may differ) → should return JSON with `"capabilities": {"images": true, ...}`.
API docs: `https://otakuvault-api.onrender.com/docs` — must list **`/api/images/mangadex`**, **`/api/images/web-search`**, etc. If you only see `/api/search`, the service is on an **old deploy** → **Manual Deploy → Deploy latest commit** (Root Directory `backend`).

> **VITE_API_URL** on Vercel = backend **origin only** (e.g. `https://otakuvalult.onrender.com`). Do **not** append `/api` or `/api/images`.

> Free plan sleeps after ~15 min idle. First request after sleep takes ~30–60 s. Upgrade or ping `/api/health` with a free uptime monitor (e.g. UptimeRobot every 10 min) to keep it warm.

---

## 3. Frontend on Vercel

1. https://vercel.com/new → **Import** `Codewithash27/OtakuValult`.
2. Configure:

| Field | Value |
|---|---|
| Framework Preset | Vite |
| **Root Directory** | `frontend` ← important |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

3. **Environment Variables** (Production + Preview):

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | your project URL |
| `VITE_SUPABASE_ANON_KEY` | anon public key |
| `VITE_API_URL` | your Render URL, e.g. `https://otakuvault-api.onrender.com` (no trailing `/`) |

4. **Deploy**. You get e.g. `https://otaku-valult.vercel.app`.

`frontend/vercel.json` already rewrites all routes to `index.html`, so refreshing `/login` or `/signup` works.

> `VITE_*` variables are baked in at build time. After changing any of them → **Deployments → … → Redeploy**.

---

## 4. Connect them (CORS + auth)

1. **Render → otakuvault-api → Environment**:
   - `FRONTEND_ORIGIN` = `https://otaku-valult.vercel.app,http://localhost:5173`
   - `FRONTEND_ORIGIN_REGEX` = `https://otaku-valult.*\.vercel\.app` (covers git preview URLs like `otaku-valult-git-main-….vercel.app`)
     (comma-separated, no trailing slashes)
   - Optional, to allow Vercel preview deployments too:
     `FRONTEND_ORIGIN_REGEX` = `https://otaku-valult-.*\.vercel\.app`
   - Save → Render redeploys automatically.
2. **Supabase → Authentication → URL Configuration** → set Site URL / Redirect URLs to your Vercel domain (step 1.3).
3. Open the Vercel URL → sign up / log in → search a title → add it. Done.

---

## 5. Updating the live site

```bash
git add -A
git commit -m "your change"
git push
```

Vercel and Render both auto-deploy from `main` on every push.

---

## 6. Run locally

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # then fill values
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
copy .env.example .env.local    # then fill values
npm run dev                      # http://localhost:5173
```

---

## 7. Troubleshooting

| Problem | Fix |
|---|---|
| Browser console: **CORS error** | `FRONTEND_ORIGIN` on Render must exactly match the Vercel URL (https, no trailing `/`). Redeploy after editing. |
| Search spins ~1 min then works | Render free instance waking up. Normal. |
| Search fails, calls `127.0.0.1:8000` | `VITE_API_URL` missing on Vercel → add it and **Redeploy**. |
| White screen / "supabaseUrl is required" | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` missing on Vercel → add and redeploy. |
| 404 on page refresh | Vercel Root Directory must be `frontend` so `vercel.json` is used. |
| Login email link goes to localhost | Update Supabase Site URL / Redirect URLs. |
| Render build fails on Python packages | Make sure `PYTHON_VERSION=3.12.4` is set. |
| Render "No module named app" | Root Directory must be `backend`. |
| 401 from backend | `SUPABASE_JWT_SECRET` on Render doesn't match your Supabase project. |

---

## 8. Security checklist

- `service_role` key and JWT secret live **only** on Render.
- Frontend only gets the `anon` key (safe — protected by Row Level Security).
- `.env`, `.env.local`, and local seeding scripts (`backend/add_*.py`, `seed_library.py`, etc.) are git-ignored.
- If a secret was ever committed or shared, rotate it in Supabase → Project Settings → API.
