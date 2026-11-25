#!/usr/bin/env bash
#
# Proves scripts/check-quickstart.sh passes the quickstart as it is and fails each way it can drift:
# a tag that differs between the three files, a duplicated or missing image line, a tag that is not a
# release, a read_only default that is not true or false, a console too old to run read-only, and a tag
# that is not published. No Docker needed: the registry cases run against a stub docker.
#
#   bash scripts/test-check-quickstart.sh

set -uo pipefail

cd "$(dirname "$0")/.."

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

pass=0
fail=0

check() { # <description> <ok|bad>
    if [ "$2" = ok ]; then echo "  ok    $1"; pass=$((pass + 1)); else echo "  FAIL  $1"; fail=$((fail + 1)); fi
}

console=$(sed -n 's/.*barako-brew:\${BARAKO_CONSOLE_TAG:-\([^}]*\)}.*/\1/p' quickstart/docker-compose.yml)

# Copies the quickstart, applies <sed expression> to <file> in the copy, and runs the check on it.
# Prints the exit code, then the check's output.
run() { # <case> <file> <sed expression>
    local dir="$tmp/$1"
    cp -R quickstart "$dir"
    if [ -n "$2" ]; then
        sed "$3" "$dir/$2" > "$dir/$2.new" && mv "$dir/$2.new" "$dir/$2"
    fi
    local out code=0
    out=$(QUICKSTART_DIR="$dir" bash scripts/check-quickstart.sh 2>&1) || code=$?
    printf '%s\n%s' "$code" "$out"
}

expect() { # <description> <0|1> <message part> <case> <file> <sed expression>
    local got code out
    got=$(run "$4" "$5" "$6")
    code=$(printf '%s\n' "$got" | head -1)
    out=$(printf '%s\n' "$got" | tail -n +2)
    if [ "$2" = 0 ]; then
        [ "$code" = 0 ] && check "$1" ok || { check "$1" bad; printf '%s\n' "$out" | sed 's/^/        /'; }
    else
        [ "$code" != 0 ] && printf '%s' "$out" | grep -qF -- "$3" && check "$1" ok \
            || { check "$1 (exit $code)" bad; printf '%s\n' "$out" | sed 's/^/        /'; }
    fi
}

expect "the quickstart as it is passes" 0 "" asis "" ""
expect "a console tag in .env.example that differs fails" 1 ".env.example shows BARAKO_CONSOLE_TAG=0.0.1" \
    env-console .env.example "s/^# BARAKO_CONSOLE_TAG=.*/# BARAKO_CONSOLE_TAG=0.0.1/"
expect "a console tag in README.md that differs fails" 1 "README.md shows BARAKO_CONSOLE_TAG=0.0.1" \
    doc-console README.md "s/^BARAKO_CONSOLE_TAG=[^ ]*/BARAKO_CONSOLE_TAG=0.0.1/"
expect "an API tag in .env.example that differs fails" 1 ".env.example shows BARAKO_API_TAG=0.0.1" \
    env-api .env.example "s/^# BARAKO_API_TAG=.*/# BARAKO_API_TAG=0.0.1/"
expect "an API tag in README.md that differs fails" 1 "README.md shows BARAKO_API_TAG=0.0.1" \
    doc-api README.md "s/^BARAKO_API_TAG=[^ ]*/BARAKO_API_TAG=0.0.1/"
expect "a console default of latest fails" 1 "not a release" \
    latest docker-compose.yml "s/BARAKO_CONSOLE_TAG:-$console}/BARAKO_CONSOLE_TAG:-latest}/"
expect "a second console image line fails" 1 "more than one value" \
    dup docker-compose.yml "/barako-brew:\${BARAKO_CONSOLE_TAG/p"
expect "a compose file with no console default fails" 1 "has no value" \
    none docker-compose.yml "s/BARAKO_CONSOLE_TAG:-$console}/BARAKO_CONSOLE_TAG}/"
expect "a read_only default of yes fails" 1 "Write true or false" \
    yes docker-compose.yml 's/CONSOLE_READ_ONLY:-true}/CONSOLE_READ_ONLY:-yes}/'
# 1.13.0 in all three files, so only the floor can fail it.
run old docker-compose.yml "s/BARAKO_CONSOLE_TAG:-$console}/BARAKO_CONSOLE_TAG:-1.13.0}/" >/dev/null
for f in .env.example README.md; do
    sed -i.bak "s/^# BARAKO_CONSOLE_TAG=.*/# BARAKO_CONSOLE_TAG=1.13.0/;s/^BARAKO_CONSOLE_TAG=[^ ]*/BARAKO_CONSOLE_TAG=1.13.0/" "$tmp/old/$f" && rm "$tmp/old/$f.bak"
done
code=0; out=$(QUICKSTART_DIR="$tmp/old" bash scripts/check-quickstart.sh 2>&1) || code=$?
[ "$code" != 0 ] && printf '%s' "$out" | grep -qF "stop at start" && check "1.13.0 in all three files, read-only, fails on the floor" ok \
    || { check "1.13.0 in all three files, read-only, fails on the floor (exit $code)" bad; printf '%s\n' "$out" | sed 's/^/        /'; }
sed -i.bak 's/read_only: \${CONSOLE_READ_ONLY:-true}/read_only: ${CONSOLE_READ_ONLY:-false}/' "$tmp/old/docker-compose.yml" && rm "$tmp/old/docker-compose.yml.bak"
code=0; QUICKSTART_DIR="$tmp/old" bash scripts/check-quickstart.sh >/dev/null 2>&1 || code=$?
[ "$code" = 0 ] && check "1.13.0 with read_only off by default passes" ok || check "1.13.0 with read_only off by default passes (exit $code)" bad

# --registry against a stub docker. STUB_MODE picks what ghcr.io answers; the stub counts its calls.
mkdir -p "$tmp/bin"
cat > "$tmp/bin/docker" <<'STUB'
#!/usr/bin/env bash
n=$(( $(cat "$STUB_COUNT" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$STUB_COUNT"
case "$STUB_MODE" in
  ok) exit 0 ;;
  missing) echo "manifest unknown" >&2; exit 1 ;;
  down) echo "dial tcp: connection refused" >&2; exit 1 ;;
  flaky) [ "$n" -ge 3 ] && exit 0; echo "net/http: TLS handshake timeout" >&2; exit 1 ;;
esac
STUB
chmod +x "$tmp/bin/docker"

registry() { # <description> <stub mode> <0|1> <message part> <stub calls>
    local out code=0 calls
    rm -f "$tmp/count"
    out=$(PATH="$tmp/bin:$PATH" STUB_MODE="$2" STUB_COUNT="$tmp/count" REGISTRY_RETRY_SECONDS=0 \
        bash scripts/check-quickstart.sh --registry 2>&1) || code=$?
    calls=$(cat "$tmp/count" 2>/dev/null || echo 0)
    if { { [ "$3" = 0 ] && [ "$code" = 0 ]; } || { [ "$3" = 1 ] && [ "$code" != 0 ]; }; } \
        && printf '%s' "$out" | grep -qF -- "$4" && [ "$calls" = "$5" ]; then
        check "$1" ok
    else
        check "$1 (exit $code, $calls calls)" bad; printf '%s\n' "$out" | sed 's/^/        /'
    fi
}

registry "--registry passes when both tags are published" ok 0 "both published" 2
registry "--registry fails a tag ghcr.io does not have, without retrying" missing 1 "is not published" 1
registry "--registry says ghcr.io could not be reached after 3 tries" down 1 "could not reach ghcr.io" 3
registry "--registry passes when ghcr.io answers on the third try" flaky 0 "both published" 4

echo "check-quickstart: $pass passed, $fail failed"
[ "$fail" = 0 ]
