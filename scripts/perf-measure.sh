#!/usr/bin/env bash
#
# Measures what perf-budget.json budgets (#853) and writes the numbers as JSON:
#
#   image_uncompressed_mb    the image as Docker stores it
#   image_compressed_mb      the image saved and gzipped, about what a registry pull transfers
#   startup_seconds          container start to the first 200 from /login
#   memory_at_rest_mb        the console's resident memory after 60 seconds idle
#
# The image is the repository's Dockerfile, built with no cache. The console has no readiness or
# health route of its own, so readiness is /login: a static page that answers without the API.
# The container is given a dummy API address that nothing listens on, so it never calls out, and
# no secret is needed.
#
# Usage: scripts/perf-measure.sh <output json>
#   IDLE_SECONDS    overrides the 60 second idle wait (for a local try)
#   DOCKERFILE      build another Dockerfile (default Dockerfile)

set -euo pipefail

OUT_ARG="${1:?usage: scripts/perf-measure.sh <output json>}"
case "$OUT_ARG" in /*) OUT="$OUT_ARG" ;; *) OUT="$PWD/$OUT_ARG" ;; esac

cd "$(dirname "$0")/.."

IDLE_SECONDS="${IDLE_SECONDS:-60}"
DOCKERFILE="${DOCKERFILE:-Dockerfile}"
TAG="barako-brew-perf:$$"
CNAME="barako-brew-perf-$$"

cleanup() {
    docker rm -f "$CNAME" >/dev/null 2>&1 || true
    docker image rm -f "$TAG" >/dev/null 2>&1 || true
}
trap cleanup EXIT

step() { printf '\n=== %s\n' "$1" >&2; }
fail() { printf '\nFAILED: %s\n' "$1" >&2; exit 1; }
now() { date +%s.%N; }
elapsed() { python3 -c "import sys; print(round(float(sys.argv[2]) - float(sys.argv[1]), 1))" "$1" "$2"; }

step "building $DOCKERFILE with no cache"
start=$(now)
# The fonts are files in the repository, so the build has no reason to reach Google Fonts. Pointing
# both hosts at nothing is what the image job in ci.yml does too.
docker build --no-cache -q -f "$DOCKERFILE" -t "$TAG" \
    --build-arg BARAKO_VERSION=0.0.0-perf \
    --add-host fonts.googleapis.com:0.0.0.0 --add-host fonts.gstatic.com:0.0.0.0 \
    . >/dev/null || fail "the image did not build"
echo "built in $(elapsed "$start" "$(now)")s" >&2

step "measuring the image"
uncompressed=$(docker image inspect -f '{{.Size}}' "$TAG")
compressed=$(docker save "$TAG" | gzip -c | wc -c)
echo "uncompressed $uncompressed bytes, compressed $compressed bytes" >&2

step "starting the console"
start=$(now)
docker run -d --name "$CNAME" -p 127.0.0.1::3000 \
    -e NEXT_PUBLIC_API_URL=http://127.0.0.1:9 \
    "$TAG" >/dev/null
PORT=$(docker port "$CNAME" 3000/tcp | head -n1 | sed 's/.*://')
[ -n "$PORT" ] || fail "cannot tell which host port the console was published on"
BASE="http://127.0.0.1:$PORT"
ready=""
for _ in $(seq 1 600); do
    if [ "$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' "$BASE/login" || true)" = "200" ]; then ready=1; break; fi
    [ "$(docker inspect -f '{{.State.Running}}' "$CNAME")" = "true" ] || { docker logs "$CNAME" 2>&1 | tail -40 >&2; fail "the console exited during startup"; }
    sleep 0.2
done
[ -n "$ready" ] || { docker logs "$CNAME" 2>&1 | tail -40 >&2; fail "/login never answered 200"; }
startup_seconds=$(elapsed "$start" "$(now)")
echo "ready in ${startup_seconds}s" >&2

step "idle for ${IDLE_SECONDS}s, then reading resident memory"
sleep "$IDLE_SECONDS"
# entrypoint.sh ends in exec, so node is PID 1 in the container, and its status file is readable
# from inside it on any Docker host (the host's /proc is not, on Docker Desktop).
rss_kb=$(docker exec "$CNAME" awk '/^VmRSS:/ {print $2}' /proc/1/status 2>/dev/null || true)
case "$rss_kb" in ''|*[!0-9]*) fail "could not read VmRSS from the console process" ;; esac
echo "VmRSS ${rss_kb} kB" >&2

python3 - "$OUT" "$uncompressed" "$compressed" "$startup_seconds" "$rss_kb" <<'PY'
import json, platform, sys
out, unc, comp, startup, rss = sys.argv[1:6]
arch = {"x86_64": "amd64", "aarch64": "arm64", "arm64": "arm64"}.get(platform.machine(), platform.machine())
metrics = {
    "image_uncompressed_mb": round(int(unc) / 1048576, 1),
    "image_compressed_mb": round(int(comp) / 1048576, 1),
    "startup_seconds": float(startup),
    "memory_at_rest_mb": round(int(rss) / 1024, 1),
}
json.dump({"arch": arch, "metrics": metrics}, open(out, "w"), indent=2)
print(json.dumps({"arch": arch, "metrics": metrics}, indent=2), file=sys.stderr)
PY
