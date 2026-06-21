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
├── scripts/
│   ├── benchmark_api.py       # API latency benchmark (before/after stored procs)
│   └── benchmark_results/     # Saved benchmark JSON outputs
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Tests

```bash
pytest
```

## Performance benchmarking

Use the benchmark script to capture API response times **before** adding stored procedures (or other DB optimizations), then compare **after** to validate improvements.

### Prerequisites

1. API running locally:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

2. At least one active crisis with reports (seed data if needed):

```bash
python scripts/seed_test_reports.py --help
```

### Run a baseline

```bash
cd backend
python scripts/benchmark_api.py --runs 20
```

This prints p50 / p95 / average latency for key endpoints and saves JSON under `scripts/benchmark_results/`.

Save your pre-change snapshot:

```bash
cp scripts/benchmark_results/<timestamp>.json scripts/benchmark_baseline.json
```

### Compare after changes

```bash
python scripts/benchmark_api.py --runs 20 --compare scripts/benchmark_baseline.json
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--base-url` | `http://127.0.0.1:8000/api/v1` | API base URL |
| `--runs` | `10` | Timed iterations per endpoint |
| `--warmup` | `2` | Warm-up requests (not counted) |
| `--compare` | — | Compare this run against a saved JSON baseline |
| `--output` | auto timestamped file | Explicit output path |

### Endpoints measured

| Endpoint | Why it matters |
|----------|----------------|
| `GET /crises/{id}/map` | **Slowest** — N+1 Supabase calls per pin for photo thumbnails |
| `GET /crises/reporting-options` | Multiple DB round trips on report wizard load |
| `GET /crises/{id}/reports` | Paginated report list |
| `GET /reports/{id}` | Report detail panel |
| `GET /reports/{id}/versions` | Version history |
| `GET /health`, `GET /ready` | Control (API-only vs Supabase check) |

### Example baseline (local dev, ~1 map pin)

These numbers vary with network latency to Supabase and report count. Use them as a reference shape, not a target:

| Endpoint | p50 | p95 |
|----------|-----|-----|
| `GET /health` | ~1 ms | ~2 ms |
| `GET /ready` | ~200 ms | ~330 ms |
| `GET /crises/reporting-options` | ~440 ms | ~570 ms |
| `GET /crises/{id}/map` | ~1000 ms | ~1150 ms |
| `GET /reports/{id}` | ~625 ms | ~665 ms |

With more reports, `/map` scales poorly today because each pin triggers separate Supabase calls in `app/services/map.py`. Stored procedures (or a single joined query) should show the largest gain there.

### Browser testing (full UX)

In DevTools → **Network**, filter `api/v1` while using the dashboard:

- Initial load: `/crises/reporting-options` + `/crises/{id}/map`
- Click a pin: `/reports/{id}` + `/reports/{id}/versions`

Use the **Time** column for end-to-end latency including network.

### Fair comparison checklist

1. Use the **same crisis** and **similar report count** before and after.
2. Run **10–20 iterations** (`--runs 20`); Supabase latency fluctuates.
3. Compare **p50 and p95**, not just average.
4. Re-benchmark after seeding realistic volumes (100–1000+ reports) — improvements are most visible at scale.

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
