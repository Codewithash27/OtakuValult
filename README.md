# MediaShelf

Monorepo for media management: React + Vite + TypeScript + Tailwind (frontend), FastAPI (backend), Supabase (Postgres + Auth + RLS).

## Stack
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS 3, TanStack Query, React Router, Supabase JS client
- **Backend**: FastAPI, Python 3.11+, Uvicorn
- **Database**: Supabase (PostgreSQL, Auth, RLS)

## Setup

### 1. Prerequisites
- Node.js 18+
- Python 3.11+
- Supabase account (create project at https://supabase.com)

### 2. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

### 3. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env.local
```

## Configuration

### Backend `.env`
Fill in your Supabase credentials and TMDB key:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key
SUPABASE_JWT_SECRET=your-secret
TMDB_API_KEY=your-key
FRONTEND_ORIGIN=http://localhost:5173
```

### Frontend `.env.local`
```
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Running

### Backend
```bash
cd backend
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm run dev
```

Visit http://localhost:5173 and check the health status.

## Build

### Frontend
```bash
cd frontend
npm run build
```

## TODO
- [ ] Create Supabase project and get credentials
- [ ] Fill `.env` files with Supabase and TMDB keys
- [ ] Get TMDB API key from https://www.themoviedb.org/settings/api
