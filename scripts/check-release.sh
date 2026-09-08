#!/usr/bin/env bash
#
# Everything a version has to agree with before a tag becomes a release.
#
# Three places state the version and nothing made them agree: the git tag decides the image tags,
# `package.json` is what `npm audit` and the SBOM report, and `CHANGELOG.md` is what a person reads.
# The console shows its own version in the About dialog, taken from the image build arg, so a tag
# that disagreed with `package.json` would ship an image telling users one number while its own
# manifest said another.
#
# Runnable by hand, which is the point. A release gate that can only be exercised by publishing is
# a gate nobody has ever seen fail, and the remedy is to run it where being wrong is cheap:
#
#   scripts/check-release.sh 1.0.0     # the version being released
#   scripts/check-release.sh 9.9.9     # proves it fails, without tagging anything

set -euo pipefail

VERSION="${1:-}"
[ -n "$VERSION" ] || { echo "usage: scripts/check-release.sh <version>   (no leading v)" >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail() { echo "::error::$1"; echo "FAILED: $1" >&2; exit 1; }

case "$VERSION" in
    v*) fail "pass the version without the leading v, got '$VERSION'" ;;
esac

# 1. package.json is the version the SBOM and every npm command will report.
PKG=$(node -p "require('$ROOT/package.json').version")
[ "$PKG" = "$VERSION" ] || fail "package.json is $PKG, the release is $VERSION. They have to match, or the image reports one number and its manifest another."

# 2. The package name, because "admin" is what it was called inside the monorepo and it leaks into
#    audit output, the SBOM and every CI log line.
NAME=$(node -p "require('$ROOT/package.json').name")
[ "$NAME" = "barakobrew" ] || fail "package.json name is '$NAME', expected 'barakobrew'."

# 3. A changelog section for exactly this version. Not a fuzzy match: `## [1.0.0]` must be there, so
#    releasing 1.0.1 cannot quietly pass on 1.0.0's notes.
CHANGELOG="$ROOT/CHANGELOG.md"
[ -f "$CHANGELOG" ] || fail "CHANGELOG.md is missing."
grep -qE "^## \[$(printf '%s' "$VERSION" | sed 's/\./\\./g')\]" "$CHANGELOG" \
    || fail "CHANGELOG.md has no '## [$VERSION]' section. A release with no notes is a tag."

# 4. That section has to say something. An empty heading passes a grep and tells a reader nothing.
#
# `|| true` on the grep, because an empty section is exactly the case this checks for and grep
# exits 1 when it matches nothing. Under `set -euo pipefail` that killed the script before it could
# say why, so the gate failed with no message. Found by running it against an empty section rather
# than by reading it.
BODY=$(awk -v v="## [$VERSION]" '
    index($0, v) == 1 { inside = 1; next }
    inside && (/^## / || /^\[[^]]+\]: /) { exit }
    inside { print }
' "$CHANGELOG" | { grep -cvE '^[[:space:]]*$' || true; } | tr -d ' ')
BODY=${BODY:-0}
[ "$BODY" -ge 3 ] || fail "the '## [$VERSION]' section has $BODY non-empty lines. That is a heading, not release notes."

echo "release checks pass for $VERSION"
echo "  package.json: $NAME@$PKG"
echo "  CHANGELOG.md: $BODY lines under ## [$VERSION]"
