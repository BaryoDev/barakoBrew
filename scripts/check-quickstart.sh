#!/usr/bin/env bash
#
# The quickstart is the first thing a newcomer runs, from master. This checks that what it starts by
# default is there and runs:
#
#   1. The API and the console each default to one pinned release, and .env.example and README.md
#      show that same tag.
#   2. With read_only on by default, the console default is 1.14.0 or newer, the first console that
#      runs from a copy under /tmp. An older one stops at start.
#   3. With --registry, each default tag is published on ghcr.io. A release PR that moves the
#      quickstart before its image is out fails here, so master never names an image nobody can pull.
#
#   bash scripts/check-quickstart.sh [--registry]
#
# QUICKSTART_DIR points it at another copy (scripts/test-check-quickstart.sh does). Exit code is the answer.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QS="${QUICKSTART_DIR:-$ROOT/quickstart}"
REGISTRY=false
[ "${1:-}" = "--registry" ] && REGISTRY=true
READ_ONLY_FLOOR=1.14.0

fail() { echo "::error::$1" >&2; exit 1; }

# The one value a sed expression prints from a file. None, or more than one, fails.
one() { # <file> <sed expression> <what>
  local out
  out=$(sed -n "$2" "$QS/$1")
  [ -n "$out" ] || fail "$3: quickstart/$1 has no value for it."
  [ "$(printf '%s\n' "$out" | wc -l | tr -d ' ')" = 1 ] || fail "$3: quickstart/$1 has more than one value for it."
  printf '%s' "$out"
}

# Prints the default tag for <var> on ghcr.io/baryodev/<image>, after checking the three files agree.
tag_of() { # <var> <image>
  local tag env doc
  # set -e does not reach into a command substitution here, so each one exits on its own.
  tag=$(one docker-compose.yml 's/.*ghcr\.io\/baryodev\/'"$2"':\${'"$1"':-\([^}]*\)}.*/\1/p' "$1") || exit 1
  [[ "$tag" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "quickstart/docker-compose.yml defaults $1 to '$tag', not a release."
  env=$(one .env.example 's/^# '"$1"'=\([^ ]*\)$/\1/p' "$1") || exit 1
  [ "$env" = "$tag" ] || fail "quickstart/.env.example shows $1=$env, docker-compose.yml defaults to $tag."
  doc=$(one README.md 's/^'"$1"'=\([^ ]*\).*/\1/p' "$1") || exit 1
  [ "$doc" = "$tag" ] || fail "quickstart/README.md shows $1=$doc, docker-compose.yml defaults to $tag."
  printf '%s' "$tag"
}

API_TAG=$(tag_of BARAKO_API_TAG barako-cms)
CONSOLE_TAG=$(tag_of BARAKO_CONSOLE_TAG barako-brew)

READ_ONLY=$(one docker-compose.yml 's/^ *read_only: \${CONSOLE_READ_ONLY:-\([^}]*\)}.*/\1/p' CONSOLE_READ_ONLY)
# Compose reads yes and on as true too, which would skip the floor below.
case "$READ_ONLY" in
  true | false) ;;
  *) fail "quickstart/docker-compose.yml defaults CONSOLE_READ_ONLY to '$READ_ONLY'. Write true or false." ;;
esac
if [ "$READ_ONLY" = true ]; then
  lowest=$(printf '%s\n%s\n' "$READ_ONLY_FLOOR" "$CONSOLE_TAG" | sort -V | head -1)
  [ "$lowest" = "$READ_ONLY_FLOOR" ] \
    || fail "the console defaults to $CONSOLE_TAG read-only. Consoles older than $READ_ONLY_FLOOR stop at start on a read-only filesystem."
fi

# 0 when ghcr.io has <ref>, 1 when ghcr.io says it does not, 2 when three tries could not tell.
published() { # <ref>
  local err try
  for try in 1 2 3; do
    err=$(docker manifest inspect "ghcr.io/baryodev/$1" 2>&1 >/dev/null) && return 0
    case "$err" in *"manifest unknown"*) return 1 ;; esac
    [ "$try" = 3 ] || sleep "${REGISTRY_RETRY_SECONDS:-5}"
  done
  printf '%s\n' "$err" | tail -3 >&2
  return 2
}

if $REGISTRY; then
  command -v docker >/dev/null || fail "--registry needs docker on PATH."
  for ref in "barako-cms:$API_TAG" "barako-brew:$CONSOLE_TAG"; do
    code=0
    published "$ref" || code=$?
    case $code in
      0) ;;
      1) fail "ghcr.io/baryodev/$ref is not published. Move the quickstart to a release once its image is out." ;;
      *) fail "could not reach ghcr.io to check ghcr.io/baryodev/$ref after 3 tries. Run the check again." ;;
    esac
  done
fi

echo "quickstart defaults: API $API_TAG, console $CONSOLE_TAG, console read_only $READ_ONLY$($REGISTRY && echo ", both published")"
