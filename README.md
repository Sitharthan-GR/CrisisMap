# CrisisMap

FastAPI backend + React dashboard for live crisis damage reporting.

## Prerequisites

- Python 3.10+
- Node.js 18+
- A [Supabase](https://supabase.com) project (PostgreSQL + PostGIS)

## Setup (first time)

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env — at minimum set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ADMIN_PASSWORD

python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Apply SQL migrations in your Supabase SQL editor (files in `backend/migrations/`).

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_DEMO_VIDEO_URL here (not in backend/.env)
```

## Run the project

Use **two terminals** — API first, then the UI.

**Terminal 1 — API**

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

**Terminal 2 — Frontend**

```bash
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

- **Dashboard:** `/`
- **Report damage:** `/report`
- **Admin:** `/admin` (uses `ADMIN_PASSWORD` from `backend/.env`)

### Mobile / LAN testing

Expose the dev server on your network:

```bash
cd frontend
npm run dev -- --host
```

GPS on phones may require HTTPS (e.g. ngrok) when not on localhost.

## More documentation

- [backend/README.md](backend/README.md) — API, Docker, tests
- [frontend/README.md](frontend/README.md) — build and environment variables
