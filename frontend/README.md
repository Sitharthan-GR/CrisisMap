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

## Build for production

```bash
npm run build
npm run preview
```

Set `VITE_API_URL` to your deployed API URL when building.
