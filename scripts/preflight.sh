#!/usr/bin/env bash
#
# Everything CI can tell you without a runner, in CI's order, before you push.
#
# CI is a bad place to learn things. Its cheapest job takes a couple of minutes and its most useful
# one stands up Postgres, seeds it, builds the console and takes twelve, so a mistake found there
# costs a context switch and a wait. Worse, the jobs are independent: the slow one can fail for a
# reason the fast one could have caught, which is exactly what happened when a vitest file landed in
# `smoke/` and Playwright, which also collects `*.test.ts`, loaded it and died before running a spec.
#
# So this runs the gates a laptop can run, in the order CI runs them, and it is explicit about the
# ones it skipped rather than implying a green run means green CI.
#
#   scripts/preflight.sh             the fast gates: lint, types, unit, discovery, build
#   scripts/preflight.sh --e2e       plus the mocked Playwright pack (needs browsers installed)
#   scripts/preflight.sh --smoke     plus the unmocked pack (needs Docker and the API image)
#   scripts/preflight.sh --all       everything
#
# Exit code is the answer. Every gate's status is read directly, never through a pipe, because a
# pipeline reports the last command's status and that is how a failed build comes to look green.

set -uo pipefail

cd "$(dirname "$0")/.."

WANT_E2E=0
WANT_SMOKE=0
for arg in "$@"; do
    case "$arg" in
        --e2e) WANT_E2E=1 ;;
        --smoke) WANT_SMOKE=1 ;;
        --all) WANT_E2E=1; WANT_SMOKE=1 ;;
        -h|--help) sed -n '3,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) printf 'unknown argument: %s\n' "$arg" >&2; exit 2 ;;
    esac
done

FAILED=()
SKIPPED=()

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
ok() { printf '\033[32m    ok\033[0m: %s\n' "$1"; }
bad() { printf '\033[31m    FAILED\033[0m: %s\n' "$1"; FAILED+=("$1"); }
skip() { printf '\033[33m    skipped\033[0m: %s\n' "$1"; SKIPPED+=("$1"); }

# Runs a gate and records the result. The status is taken from the command itself.
gate() {
    local label="$1"; shift
    step "$label"
    if "$@"; then ok "$label"; else bad "$label"; fi
}

# The engines field is not advice. Node 20 fails the unit suite inside undici with
# `webidl.util.markAsUncloneable`, which reads like a broken test and is a wrong Node.
step "node version"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 22 ]; then
    bad "node $(node -v) is below the >=22.11.0 this package requires"
else
    ok "node $(node -v)"
fi

gate "lint" npm run lint
gate "typecheck" npx tsc --noEmit

# The same floor CI asserts, read from the JSON reporter rather than the console output: a run that
# discovers no test files exits zero, so the count is the signal and the status is not.
step "unit tests"
if npx vitest run --reporter=default --reporter=json --outputFile.json=.preflight-unit.json; then
    COUNT=$(jq -r '.numTotalTests // 0' .preflight-unit.json 2>/dev/null || echo 0)
    if [ "$COUNT" -ge 200 ] 2>/dev/null; then
        ok "unit tests: $COUNT"
    else
        bad "vitest discovered $COUNT tests, below the floor of 200 that CI asserts"
    fi
else
    bad "unit tests"
fi
rm -f .preflight-unit.json

# Two runners share this tree and a file claimed by both breaks the slow one. Listing costs a second
# and is the difference between learning that here and learning it after a database has been seeded.
for cfg in playwright.config.ts playwright.smoke.config.ts; do
    step "test discovery: $cfg"
    if OUT=$(npx playwright test --config="$cfg" --list 2>&1); then
        ok "$(printf '%s' "$OUT" | tail -1)"
    else
        printf '%s\n' "$OUT" | tail -20
        bad "test discovery: $cfg"
    fi
done

gate "assets carry no provenance metadata" python3 scripts/asset-provenance.py .
gate "licences" bash scripts/check-licences.sh . 400

# The image job compiles the console, so a build break is otherwise found by the slowest job there
# is. next build is the same command that runs in the Dockerfile.
gate "build" npm run build

if [ "$WANT_E2E" -eq 1 ]; then
    gate "end to end (mocked)" npx playwright test
else
    skip "end to end (mocked): --e2e"
fi

if [ "$WANT_SMOKE" -eq 1 ]; then
    gate "the unmocked pack against a real API" bash scripts/smoke-check.sh
else
    skip "the unmocked pack against a real API: --smoke, and it needs Docker"
fi

# What a laptop cannot answer. Said out loud, so a green run here is not mistaken for a green CI.
skip "dependency audit, SBOM, image builds and the multi-arch gate: these need the registry and a builder"

printf '\n'
if [ ${#SKIPPED[@]} -gt 0 ]; then
    printf 'not checked here:\n'
    for s in "${SKIPPED[@]}"; do printf '  - %s\n' "$s"; done
    printf '\n'
fi

if [ ${#FAILED[@]} -gt 0 ]; then
    printf '\033[31m%d gate(s) failed:\033[0m\n' "${#FAILED[@]}"
    for f in "${FAILED[@]}"; do printf '  - %s\n' "$f"; done
    exit 1
fi

printf '\033[32mevery gate this machine can run is green\033[0m\n'
