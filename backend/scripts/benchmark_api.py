#!/usr/bin/env python3
"""Measure API response times for before/after stored-procedure comparisons.

Usage:
  python scripts/benchmark_api.py
  python scripts/benchmark_api.py --base-url http://127.0.0.1:8000/api/v1 --runs 20
  python scripts/benchmark_api.py --compare scripts/benchmark_baseline.json

Results are saved to scripts/benchmark_results/<timestamp>.json
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_BASE = "http://127.0.0.1:8000/api/v1"
RESULTS_DIR = Path(__file__).resolve().parent / "benchmark_results"


def fetch(base_url: str, path: str) -> tuple[int, float, int]:
    req = urllib.request.Request(f"{base_url.rstrip('/')}{path}", method="GET")
    start = time.perf_counter()
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = resp.read()
        status = resp.status
    elapsed_ms = (time.perf_counter() - start) * 1000
    return status, elapsed_ms, len(body)


def bench(base_url: str, name: str, path: str, *, warmup: int, runs: int) -> dict:
    try:
        for _ in range(warmup):
            fetch(base_url, path)
        times: list[float] = []
        last_size = 0
        for _ in range(runs):
            _, ms, size = fetch(base_url, path)
            times.append(ms)
            last_size = size
        ordered = sorted(times)
        p95_index = max(0, int(len(ordered) * 0.95) - 1)
        return {
            "name": name,
            "path": path,
            "runs": runs,
            "min_ms": round(min(times), 1),
            "p50_ms": round(statistics.median(times), 1),
            "p95_ms": round(ordered[p95_index], 1),
            "max_ms": round(max(times), 1),
            "avg_ms": round(statistics.mean(times), 1),
            "bytes": last_size,
            "ok": True,
        }
    except Exception as exc:  # noqa: BLE001 - CLI tool
        return {"name": name, "path": path, "ok": False, "error": str(exc)}


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def discover_ids(base_url: str) -> dict:
    with urllib.request.urlopen(
        f"{base_url.rstrip('/')}/crises/reporting-options?lat=35.96&lng=-83.93"
    ) as resp:
        opts = json.loads(resp.read())["data"]

    crisis_id = opts["crises"][0]["id"] if opts.get("crises") else None
    if not crisis_id:
        raise RuntimeError("No active crises found — seed data or create a crisis first.")

    with urllib.request.urlopen(
        f"{base_url.rstrip('/')}/crises/{crisis_id}/map?status=all"
    ) as resp:
        map_data = json.loads(resp.read())["data"]

    features = map_data.get("features") or []
    report_id = features[0]["properties"]["report_id"] if features else None

    return {
        "crisis_id": crisis_id,
        "report_id": report_id,
        "map_pin_count": map_data.get("total", len(features)),
    }


def build_endpoints(ctx: dict) -> list[tuple[str, str]]:
    crisis_id = ctx["crisis_id"]
    report_id = ctx["report_id"]
    endpoints: list[tuple[str, str]] = [
        ("health", "/health"),
        ("ready", "/ready"),
        ("reporting-options", "/crises/reporting-options?lat=35.9606&lng=-83.9207"),
        ("list-crises", "/crises?status=active"),
        ("get-crisis", f"/crises/{crisis_id}"),
        ("crisis-map", f"/crises/{crisis_id}/map?status=all"),
        ("crisis-map-validated", f"/crises/{crisis_id}/map?status=validated"),
        ("crisis-reports-p50", f"/crises/{crisis_id}/reports?limit=50&page=1"),
        ("geocode-reverse", "/geocode/reverse?lat=35.9610&lng=-83.9298"),
        ("geocode-search", "/geocode/search?q=knoxville&limit=5"),
    ]
    if report_id:
        endpoints.extend(
            [
                ("report-detail", f"/reports/{report_id}"),
                ("report-versions", f"/reports/{report_id}/versions"),
            ]
        )
    return endpoints


def print_results(results: list[dict]) -> None:
    print(f"{'endpoint':<22} {'p50':>10} {'p95':>10} {'avg':>10} {'size':>8}")
    print("-" * 64)
    for row in results:
        if row.get("ok"):
            print(
                f"{row['name']:<22} "
                f"{row['p50_ms']:>9.1f}ms "
                f"{row['p95_ms']:>9.1f}ms "
                f"{row['avg_ms']:>9.1f}ms "
                f"{row['bytes']:>7}B"
            )
        else:
            print(f"{row['name']:<22} FAILED: {row.get('error')}")


def compare_baselines(before: dict, after: dict) -> None:
    before_map = {item["name"]: item for item in before.get("endpoints", []) if item.get("ok")}
    after_map = {item["name"]: item for item in after.get("endpoints", []) if item.get("ok")}

    print(f"Before: {before.get('timestamp')}  pins={before.get('map_pin_count')}")
    print(f"After:  {after.get('timestamp')}  pins={after.get('map_pin_count')}")
    print(f"{'endpoint':<22} {'before p50':>12} {'after p50':>12} {'change':>10}")
    print("-" * 60)
    for name in before_map:
        if name not in after_map:
            continue
        b = before_map[name]["p50_ms"]
        a = after_map[name]["p50_ms"]
        delta = a - b
        pct = ((a - b) / b * 100) if b else 0
        sign = "+" if delta >= 0 else ""
        print(f"{name:<22} {b:>11.1f}ms {a:>11.1f}ms {sign}{delta:.1f}ms ({sign}{pct:.0f}%)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark CrisisMap API latency")
    parser.add_argument("--base-url", default=DEFAULT_BASE)
    parser.add_argument("--warmup", type=int, default=2)
    parser.add_argument("--runs", type=int, default=10)
    parser.add_argument(
        "--compare",
        type=Path,
        help="Compare this run against a previous benchmark JSON file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional explicit output path (default: scripts/benchmark_results/<timestamp>.json)",
    )
    args = parser.parse_args()

    if args.compare and not args.compare.exists():
        print(f"Baseline file not found: {args.compare}", file=sys.stderr)
        return 1

    try:
        ctx = discover_ids(args.base_url)
    except (urllib.error.URLError, RuntimeError, KeyError) as exc:
        print(f"Setup failed: {exc}", file=sys.stderr)
        print("Is the API running?  uvicorn app.main:app --reload --port 8000", file=sys.stderr)
        return 1

    endpoints = build_endpoints(ctx)
    results = [
        bench(args.base_url, name, path, warmup=args.warmup, runs=args.runs)
        for name, path in endpoints
    ]

    payload = {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "base_url": args.base_url,
        **ctx,
        "warmup": args.warmup,
        "runs": args.runs,
        "endpoints": results,
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    output = args.output or RESULTS_DIR / f"{payload['timestamp'].replace(':', '-')}.json"
    output.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    print(f"Benchmark @ {args.base_url}")
    print(f"Crisis: {ctx['crisis_id']}")
    print(f"Map pins: {ctx['map_pin_count']}")
    print(f"Sample report: {ctx['report_id']}")
    print_results(results)
    print("-" * 64)
    print(f"Saved {output}")

    if args.compare:
        print()
        compare_baselines(load_json(args.compare), payload)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
