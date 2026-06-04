# CrisisMap API

Production-oriented FastAPI server that integrates with Supabase for crisis reporting.

## Features

- **Async Supabase client** (httpx → PostgREST / RPC) — no blocking SDK calls
- **Versioned API** (`/api/v1`)
- **Structured logging** with request IDs (`X-Request-ID`)
- **Health & readiness** probes for Kubernetes / Docker
- **Typed request/response** models (Pydantic v2)
- **Centralized error handling** with consistent JSON error shape
- **CORS**, gzip, lifespan-managed dependencies
- **Docker** multi-stage image with non-root user

## Quick start

### 1. Configure environment

```bash
cd backend
cp .env.example .env
# Edit .env with your Supabase URL and service role key
```

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Project URL, e.g. `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only — never expose to frontend) |
| `SUPABASE_NEARBY_CRISIS_RPC` | RPC name (default: `get_nearby_crisis_records`) |

### 2. Install & run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e ".[dev]"   # optional: tests & lint

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000/docs](http://localhost:8000/docs) for interactive API docs.

### 3. Docker

```bash
docker compose up --build
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Liveness |
| `GET` | `/api/v1/ready` | Readiness (checks Supabase) |
| `GET` | `/api/v1/crises/nearby` | Nearby crises via `get_nearby_crisis_records` RPC |

### Get nearby crises (matches your Supabase RPC)

```bash
curl "http://localhost:8000/api/v1/crises/nearby?user_lat=35.9606&user_lng=-83.9207&radius_meters=10000"
```

This maps to:

```javascript
const { data, error } = await supabase.rpc('get_nearby_crisis_records', {
  user_lat: 35.9606,
  user_lng: -83.9207,
  radius_meters: 10000
});
```

## Project structure

```text
backend/
├── app/
│   ├── main.py              # App factory, middleware, routes
│   ├── config.py            # Environment settings
│   ├── dependencies.py      # FastAPI DI
│   ├── api/v1/              # Versioned routes
│   ├── core/                # Logging, errors, middleware
│   ├── schemas/             # Pydantic models
│   └── services/            # Supabase HTTP client
├── tests/
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Tests

```bash
pytest
```

## Production notes

1. Run with multiple workers: `uvicorn app.main:app --workers 4` (see Dockerfile).
2. Terminate TLS at your load balancer; enable `--proxy-headers`.
3. Store secrets in your platform vault (not committed `.env`).
4. Point readiness probe at `/api/v1/ready` (returns 503 if Supabase is down).
5. When you add auth, forward the user JWT and use RLS instead of the service role for user-scoped writes.

## Next steps

- File uploads → Supabase Storage + signed URLs
- User auth → validate Supabase JWT on protected routes
- AI pipeline → background workers for analysis on nearby / new reports
