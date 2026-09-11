#!/usr/bin/env bash
#
# Runs the real console against the real API, with no mocking anywhere.
#
# Why this exists, in one sentence: every other console test mocks the API with page.route, so it
# proves the console behaves correctly given fixtures the same person wrote, and cannot prove those
# fixtures match the server.
#
# That gap shipped a bug and kept it. The History panel read `versions` from a response that had
# returned `items` since the envelope change. It rendered an empty list rather than failing, which
# reads as "this entry has no history", and every mocked spec stayed green because the mock returned
# `versions` too. Nothing in CI could have caught it.
#
# The sequence:
#
#   1. stand up Postgres in a container
#   2. start the published API image, seeder on, so there is an administrator
#   3. seed one content type and one entry, through the API, so there is something to list
#   4. build and start the console from the working tree, pointed at that API
#   5. run smoke/, which contains no page.route and must not
#
# The API comes from ghcr.io/baryodev/barako-cms rather than from source, because this repository
# holds no source for it. BARAKO_API_TAG picks the tag.
#
# The default is :master, the build of the API's master branch, because that is what CI runs
# (the BARAKO_API_TAG repository variable is set to it) and a local run that tests a different
# server than CI is worse than no local run. It cost half an hour to learn that once: the pack
# failed here and passed on CI, and the difference was the tag.
#
# It used to default to :playground, the build behind playground.baryo.dev. That tag lags, because
# it moves when the playground is deployed rather than when the API changes, so it can be missing a
# fix the console is already written against.
#
# Usage: scripts/smoke-check.sh

set -euo pipefail

NET="smoke-check-net"
PG="smoke-check-pg"
APIC="smoke-check-api"
API_IMAGE="ghcr.io/baryodev/barako-cms:${BARAKO_API_TAG:-master}"
API_PORT="${API_PORT:-5099}"
ADMIN_PORT="${ADMIN_PORT:-3200}"
ADMIN_USERNAME='admin'
ADMIN_PASSWORD='SmokeCheck!123'
JWT_KEY='smoke-check-key-that-is-at-least-32-chars-long'
API="http://127.0.0.1:${API_PORT}"

cleanup() {
    if [ -n "${ADMIN_PID:-}" ]; then kill "$ADMIN_PID" 2>/dev/null || true; wait "$ADMIN_PID" 2>/dev/null || true; fi
    if [ "${KEEP_API_LOGS:-}" = "1" ] || [ -n "${FAILED:-}" ]; then
        printf '\n=== API container log (last 80 lines)\n' >&2
        docker logs --tail 80 "$APIC" >&2 2>&1 || true
    fi
    docker rm -f "$APIC" "$PG" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
}
trap cleanup EXIT

step() { printf '\n=== %s\n' "$1"; }
fail() { FAILED=1; printf '\nFAILED: %s\n' "$1" >&2; exit 1; }

# A port already in use makes every check below pass for the wrong reason: the browser reaches
# whatever is listening and the assertions describe someone else's process.
#
# `if lsof ...` on a missing binary is false, which reads as "port free" and fails open, so pick a
# tool that exists and say so when neither does.
if command -v lsof >/dev/null 2>&1; then
    port_in_use() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
elif command -v ss >/dev/null 2>&1; then
    port_in_use() { ss -ltn "sport = :$1" 2>/dev/null | grep -q LISTEN; }
else
    echo "note: neither lsof nor ss is available, so the port check below is skipped" >&2
    port_in_use() { return 1; }
fi

for port in "$API_PORT" "$ADMIN_PORT"; do
    if port_in_use "$port"; then
        fail "port $port is already in use. Something else would answer below and this run would pass without testing anything."
    fi
done

# Refuse before spending minutes on a stack if a mock has crept in. The value of this pack is
# entirely that it does not mock, and one page.route added in a hurry would quietly turn it back
# into the thing it replaced. A call, not a mention: the doc comment explaining why mocking is
# banned here must not trip the guard.
if grep -rnE "^[^*/]*page\\.route\\(" smoke/ >/dev/null 2>&1; then
    grep -rnE "^[^*/]*page\\.route\\(" smoke/ >&2
    fail "smoke/ contains a route mock. That is the one thing this pack must not do."
fi

step "starting postgres"
docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" \
    -e POSTGRES_DB=barako_cms -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres \
    postgres:16-alpine >/dev/null
# -h 127.0.0.1 forces TCP. The postgres image runs a temporary initdb server on the Unix socket
# first, so a socket check succeeds during bootstrap and the wait breaks early against a server that
# is about to shut down.
for _ in $(seq 1 60); do docker exec "$PG" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break; sleep 2; done
docker exec "$PG" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 || fail "postgres never became ready"

step "starting the API from $API_IMAGE"
docker pull -q "$API_IMAGE" >/dev/null || fail "could not pull $API_IMAGE"
# Development, not Production, and this is a real trade worth stating. The refresh cookie is marked
# Secure everywhere except a Development host, so over plain http a Production host sets a cookie
# the browser refuses to store and the console bounces back to the login page. That is correct
# behaviour, not a bug, and it is what a browser would hit here.
#
# What this pack therefore does NOT cover: the cookie attributes on a Production host. Said out loud
# so nobody reads a green run here as covering it.
#
# CORS__AllowedOrigins is a comma separated string, not an array: the key is CORS:AllowedOrigins.
# Named CORS__AllowedOrigins__0 the first time, and the browser answered every request with a CORS
# failure rather than anything about the contract.
docker run -d --name "$APIC" --network "$NET" -p "${API_PORT}:8080" \
    -e ASPNETCORE_ENVIRONMENT=Development \
    -e "ConnectionStrings__DefaultConnection=Host=${PG};Port=5432;Database=barako_cms;Username=postgres;Password=postgres" \
    -e "JWT__Key=${JWT_KEY}" \
    -e "InitialAdmin__Username=${ADMIN_USERNAME}" \
    -e "InitialAdmin__Password=${ADMIN_PASSWORD}" \
    -e "CORS__AllowedOrigins=http://127.0.0.1:${ADMIN_PORT}" \
    -e Kubernetes__Enabled=false \
    -e Swagger__Enabled=true \
    "$API_IMAGE" >/dev/null

# Every request here is bounded. A container that accepts the connection and then sends nothing
# leaves an unbounded curl waiting, and the readiness loop stops being a loop: it blocks on the
# first attempt until the job's own timeout, which reports as "the job hung" rather than "the API
# did not answer".
CURL=(curl -s --connect-timeout 5 --max-time 15)

for _ in $(seq 1 60); do
    [ "$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$API/health" 2>/dev/null)" = "200" ] && break
    sleep 2
done
[ "$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$API/health" 2>/dev/null)" = "200" ] || fail "the API never became healthy"
# Health answered, but by what? If the container we started is gone, something else is on that port.
[ "$(docker inspect -f '{{.State.Running}}' "$APIC" 2>/dev/null)" = "true" ] || fail "the API container exited; whatever answered /health is not it"
BUILD=$("${CURL[@]}" "$API/health/build" 2>/dev/null || true)
echo "API image reports build: ${BUILD:-unknown}"

# The OpenAPI document is how smoke/enums.spec.ts checks the enums this console transcribes
# against the server's own declaration of them. Asserted here rather than only in the spec, so a
# missing document fails as "the API did not publish it" instead of as a puzzling assertion.
[ "$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$API/swagger/v1/swagger.json")" = "200" ] \
    || fail "the API served no OpenAPI document, so the enum checks would compare against nothing"

step "seeding one content type and one entry"
TOKEN=$("${CURL[@]}" -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
    -d "{\"username\":\"${ADMIN_USERNAME}\",\"password\":\"${ADMIN_PASSWORD}\"}" \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))')
[ -n "$TOKEN" ] || fail "could not log in as the seeded administrator, so the smoke run would test nothing"

# Handed to the pack so a test that needs to call the API directly does not have to spend one of the
# five auth requests the limiter allows per fifteen minutes. The console keeps its access token in
# memory rather than localStorage, deliberately, so there is nothing for a test to read out of the
# browser.

# --fail, because curl reports a 400 or a 401 as a successful transfer. Without it a refused seed
# is only noticed at the count check below, which then blames the console for an empty list when
# the entry was never created. Say which call failed, at the point it fails.
# The type a reference points at, created first so the reference below has a target that exists.
"${CURL[@]}" --fail-with-body -o /dev/null -X POST "$API/api/content-types" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"name":"smokeauthor","displayName":"Smoke Author","fields":[{"name":"Name","type":"string"}]}' \
    || fail "the API refused the reference target type, so the reference field below could not be seeded"

# Author is a reference, because the console reads referenceType off the definition to know what to
# offer in its picker, and a definition without one would leave that unchecked here.
"${CURL[@]}" --fail-with-body -o /dev/null -X POST "$API/api/content-types" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"name":"smokepost","displayName":"Smoke Post","fields":[{"name":"Title","type":"string"},{"name":"Author","type":"reference","referenceType":"smokeauthor"}]}' \
    || fail "the API refused the seed content type, so nothing below would be testing the console"

"${CURL[@]}" --fail-with-body -o /dev/null -X POST "$API/api/contents" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"contentType":"smokeauthor","data":{"Name":"Smoke author"},"status":"Published"}' \
    || fail "the API refused the seed author, so the reference picker would have nothing to list"

"${CURL[@]}" --fail-with-body -o /dev/null -X POST "$API/api/contents" -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"contentType":"smokepost","data":{"Title":"Smoke entry"},"status":"Draft"}' \
    || fail "the API refused the seed entry, so nothing below would be testing the console"

# The list has to have something in it, or "no rows" and "the client cannot read the envelope" look
# the same from the browser, which is the ambiguity this whole script exists to remove.
COUNT=$("${CURL[@]}" "$API/api/contents?page=1&pageSize=5" -H "Authorization: Bearer $TOKEN" \
    | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("items",[])))')
[ "${COUNT:-0}" -gt 0 ] || fail "seeding produced no content, so an empty console list would prove nothing"
echo "seeded $COUNT entr(y|ies)"

# The browser sends X-Tenant. If the seeded entry is invisible under that header, the console shows
# an empty list while the API has content, and every assertion below about the list would be
# describing the empty state rather than the contract.
TENANTED=$("${CURL[@]}" "$API/api/contents?page=1&pageSize=5" -H "Authorization: Bearer $TOKEN" -H "X-Tenant: default" \
    | python3 -c 'import json,sys; print(len(json.load(sys.stdin).get("items",[])))')
[ "${TENANTED:-0}" -gt 0 ] || fail "the seeded entry is not visible with X-Tenant: default, which is the header the console sends. Seeding and reading disagree about the tenant."
echo "visible under X-Tenant: default: $TENANTED"

step "building and starting the console"
NEXT_PUBLIC_API_URL="$API" npm run build --silent
# next.config.ts sets output: standalone, and `next start` refuses that build. Running the
# standalone server is also the closer simulation: it is what the published image runs.
cp -R .next/static ".next/standalone/.next/static"
(
    exec env PATH="$PATH" HOME="$HOME" NEXT_PUBLIC_API_URL="$API" \
        HOSTNAME=127.0.0.1 PORT="$ADMIN_PORT" \
        node .next/standalone/server.js
) &
ADMIN_PID=$!

for _ in $(seq 1 60); do
    "${CURL[@]}" -o /dev/null "http://127.0.0.1:${ADMIN_PORT}/login" && break
    sleep 2
done
"${CURL[@]}" -o /dev/null "http://127.0.0.1:${ADMIN_PORT}/login" || fail "the console never started"
kill -0 "$ADMIN_PID" 2>/dev/null || fail "the console process exited; whatever answered is not it"

step "running the unmocked pack"
SMOKE_API_URL="$API" \
SMOKE_TOKEN="$TOKEN" \
SMOKE_ADMIN_URL="http://127.0.0.1:${ADMIN_PORT}" \
SMOKE_ADMIN_USERNAME="$ADMIN_USERNAME" \
SMOKE_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    npx playwright test --config=playwright.smoke.config.ts --project=chromium ${SMOKE_FILTER:-} || fail "the unmocked pack failed"

printf '\nthe console and the API agree on the contract\n'
