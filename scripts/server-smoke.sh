#!/usr/bin/env bash
# Starts the Server the way apps/server/Dockerfile does (strip-types, no build
# step), waits for /health, and stops it. Strip-only mode rejects TypeScript
# that tsc accepts, so the tests alone do not prove the image starts.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
port="${SMOKE_PORT:-3999}"
data="$(mktemp -d)"
log="${data}/server.log"
cd "${root}/apps/server"
PORT="$port" UNBORED_DATA_DIR="$data" \
  UNBORED_COMPANION_TOKEN=smoke-companion UNBORED_PLANNER_TOKEN=smoke-planner \
  node --experimental-sqlite --experimental-strip-types src/index.ts >"$log" 2>&1 &
pid=$!
trap 'kill "$pid" 2>/dev/null || true; rm -rf "$data"' EXIT
for _ in $(seq 1 30); do
  if body="$(curl -fsS "http://127.0.0.1:${port}/health" 2>/dev/null)"; then
    echo "health: ${body}"
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "the Server exited at start:" >&2
    cat "$log" >&2
    exit 1
  fi
  sleep 1
done
echo "no /health answer after 30 s:" >&2
cat "$log" >&2
exit 1
