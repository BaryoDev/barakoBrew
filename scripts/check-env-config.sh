#!/usr/bin/env bash
#
# entrypoint.sh writes public/env-config.js, which every page loads as a script. This runs that
# generation against awkward names and values and reads the file back the way a browser would, so
# the check is on what the page gets, not on the text of the file.
#
#   1. A plain environment produces exactly the file it always has.
#   2. Only names that start with NEXT_PUBLIC_ reach the file. A name that merely contains it, or a
#      value holding a line that looks like one, does not.
#   3. Quotes, backslashes, newlines and a closing script tag come back as the same string, and
#      the file never contains a literal "</script".
#
# Exit code is the answer.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAILED=0
fail() { printf 'FAILED: %s\n' "$1" >&2; FAILED=1; }

# Runs entrypoint.sh in an empty directory with only the given environment, and prints the path of
# the env-config.js it wrote.
generate() {
    local dir
    dir="$(mktemp -d "$WORK/run.XXXXXX")"
    mkdir -p "$dir/public"
    (cd "$dir" && env -i PATH="$PATH" "$@" sh "$ROOT/entrypoint.sh" true >"$dir/stdout" 2>"$dir/stderr") || {
        cat "$dir/stderr" >&2
        fail "entrypoint.sh exited non-zero"
    }
    printf '%s/public/env-config.js' "$dir"
}

# 1. A plain environment. The expected text is what entrypoint.sh wrote before values were encoded.
# Keys come out in the order the shell passes the environment, which busybox and bash do not agree
# on, so the lines between the braces are compared sorted.
plain="$(generate NEXT_PUBLIC_API_URL=https://api.example.test:5005 NEXT_PUBLIC_PRESS_URL=https://press.example.test HOME=/root)"
expected="$WORK/plain-expected.js"
printf 'window._env_ = {\n  NEXT_PUBLIC_API_URL: "https://api.example.test:5005",\n  NEXT_PUBLIC_PRESS_URL: "https://press.example.test",\n};\n' >"$expected"
normalise() { { head -1 "$1"; sed '1d;$d' "$1" | LC_ALL=C sort; tail -1 "$1"; } >"$2"; }
normalise "$expected" "$WORK/plain-expected.sorted"
normalise "$plain" "$WORK/plain-got.sorted"
if ! diff -u "$WORK/plain-expected.sorted" "$WORK/plain-got.sorted"; then
    fail "a plain environment no longer produces the same env-config.js"
fi

# 2 and 3. Names and values chosen to break out of a string literal or reach the browser by
# accident. The expected object is built by node from the same environment, so the comparison is
# exact: every key, and every value byte for byte.
nl=$'\n'
hostile_env=(
    "NEXT_PUBLIC_API_URL=https://api.example.test"
    "NEXT_PUBLIC_QUOTE=a\"b"
    "NEXT_PUBLIC_BACKSLASH=a\\b\\"
    "NEXT_PUBLIC_NEWLINE=line one${nl}line two"
    "NEXT_PUBLIC_SCRIPT=</script><script>window.pwned=1</script>"
    "NEXT_PUBLIC_BREAKOUT=\", pwned: (window.pwned = 1), x: \""
    "NEXT_PUBLIC_EMPTY="
    "NEXT_PUBLIC_SPACES=a  b *"
    "NEXT_PUBLIC_DOLLAR=\$(id) \`id\` \$HOME"
    "NEXT_PUBLIC_SEPARATORS=a"$'\xe2\x80\xa8'"b"$'\xe2\x80\xa9'"c"
    "APP_NEXT_PUBLIC_TOKEN=secret-by-name"
    "OTHER=x NEXT_PUBLIC_LEAK=secret-in-value"
    "MULTILINE=x${nl}NEXT_PUBLIC_INJECT=secret-on-a-line"
    "NEXT_PUBLIC_BAD-NAME=secret-bad-name"
)
hostile="$(generate "${hostile_env[@]}")"

if grep -qi '</script' "$hostile"; then
    fail "env-config.js contains a literal </script"
fi
if grep -q 'secret-' "$hostile"; then
    fail "a variable not named NEXT_PUBLIC_* reached env-config.js"
fi

env -i PATH="$PATH" "${hostile_env[@]}" CONFIG="$hostile" node -e '
const fs = require("fs");
const vm = require("vm");
const window = {};
vm.runInNewContext(fs.readFileSync(process.env.CONFIG, "utf8"), { window });
const got = window._env_;
const want = {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_QUOTE: process.env.NEXT_PUBLIC_QUOTE,
    NEXT_PUBLIC_BACKSLASH: process.env.NEXT_PUBLIC_BACKSLASH,
    NEXT_PUBLIC_NEWLINE: process.env.NEXT_PUBLIC_NEWLINE,
    NEXT_PUBLIC_SCRIPT: process.env.NEXT_PUBLIC_SCRIPT,
    NEXT_PUBLIC_BREAKOUT: process.env.NEXT_PUBLIC_BREAKOUT,
    NEXT_PUBLIC_EMPTY: "",
    NEXT_PUBLIC_SPACES: process.env.NEXT_PUBLIC_SPACES,
    NEXT_PUBLIC_DOLLAR: process.env.NEXT_PUBLIC_DOLLAR,
    NEXT_PUBLIC_SEPARATORS: process.env.NEXT_PUBLIC_SEPARATORS,
};
const problems = [];
if ("pwned" in window) problems.push("a value ran as code");
if (!got || typeof got !== "object") problems.push("window._env_ is not an object");
const gotKeys = Object.keys(got || {}).sort();
const wantKeys = Object.keys(want).sort();
if (gotKeys.length === 0) problems.push("window._env_ has no keys");
if (JSON.stringify(gotKeys) !== JSON.stringify(wantKeys))
    problems.push("keys differ: got " + JSON.stringify(gotKeys) + ", want " + JSON.stringify(wantKeys));
for (const k of wantKeys)
    if (got && got[k] !== want[k]) problems.push(k + " is " + JSON.stringify(got[k]) + ", want " + JSON.stringify(want[k]));
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
' || fail "env-config.js does not read back as exactly the NEXT_PUBLIC_ variables it was given"

if [ "$FAILED" -ne 0 ]; then
    printf '\nenv-config.js as generated from the hostile environment:\n' >&2
    cat "$hostile" >&2 2>/dev/null
    exit 1
fi
printf 'env-config.js: plain output unchanged, hostile names excluded, hostile values read back exactly\n'
