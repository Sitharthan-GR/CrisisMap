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

Upload your narrated demo (`demo/output/crisismap-full-demo.mp4`) to a public host, then set `VITE_DEMO_VIDEO_URL` in `frontend/.env`:

```bash
# Supabase Storage (public bucket)
VITE_DEMO_VIDEO_URL=https://YOUR_PROJECT.supabase.co/storage/v1/object/public/YOUR_BUCKET/crisismap-demo.mp4

# YouTube (unlisted)
VITE_DEMO_VIDEO_URL=https://www.youtube.com/watch?v=YOUR_VIDEO_ID
```

Rebuild or restart `npm run dev` after changing `.env`. If unset, the video section is hidden on `/help`.

## Build for production

```bash
npm run build
npm run preview
```

Set `VITE_API_URL` to your deployed API URL when building.
