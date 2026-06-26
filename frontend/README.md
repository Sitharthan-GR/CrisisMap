# CrisisMap Frontend

React dashboard with an interactive map for viewing nearby crisis reports from the FastAPI backend.

## Stack

- **Vite + React + TypeScript**
- **Leaflet** (dark map tiles, markers, search radius circle)
- **Tailwind CSS**

## Quick start

### 1. Start the API (separate terminal)

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### 2. Start the frontend

```bash
cd frontend
npm install
cp .env.example .env   # optional — defaults work with Vite proxy
npm run dev
```

Open **http://localhost:5173**

## Features

- Dark-themed operations dashboard
- Map centered on Knoxville by default (matches API examples)
- Fetches `GET /api/v1/crises/nearby` and plots markers by severity
- Sidebar list synced with map selection
- Adjustable search radius (5–50 km)
- “Use my location” geolocation button
- **Building footprints** from OpenStreetMap (zoom to level 14+, toggle in sidebar)
- Stats: report count, high-priority count, crisis types

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `/api/v1` | API base URL (proxied to `:8000` in dev) |
| `VITE_DEMO_VIDEO_URL` | *(unset)* | Help page demo video — hosted MP4/WebM URL, or YouTube/Vimeo link |

### Demo video on the help page

The video appears on **Help → How to use** (not the Map legend tab).

**Option A — runtime config (no rebuild needed to change URL)**

Edit `frontend/public/demo-config.json` and redeploy:

```json
{
  "demoVideoUrl": "https://YOUR_HOST/path/to/crisismap-demo.mp4"
}
```

**Option B — Vite env var (requires rebuild)**

Set in `frontend/.env` locally or in Vercel **before** the build runs:

```bash
VITE_DEMO_VIDEO_URL=https://YOUR_PROJECT.supabase.co/storage/v1/object/public/YOUR_BUCKET/crisismap-demo.mp4
```

On Vercel:

1. **Root Directory** must be `frontend` (Project Settings → General).
2. Add `VITE_DEMO_VIDEO_URL` for **Production** (and Preview if you use preview deploys).
3. **Redeploy** after adding or changing the variable — Vite bakes `VITE_*` values into the JS at build time; changing env alone does not update a live deployment.

Build-time env overrides `demo-config.json` when both are set.

## Build for production

```bash
npm run build
npm run preview
```

Set `VITE_API_URL` to your deployed API URL when building.
