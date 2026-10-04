#!/usr/bin/env bash
# Fails when an npm audit report holds a Critical or High advisory that is not accepted.
#
#   scripts/audit-gate.sh <audit.json> [<allowlist.json>] [<today YYYY-MM-DD>]
#
# An advisory is accepted only while it is named in the allowlist (default
# .github/audit-allowlist.json) with a reason and an expiry date that has not passed. An expired
# entry accepts nothing, so the gate goes red again on that date and somebody looks at it.
#
# It counts advisories, not packages: npm lists every package on the path to a vulnerable one
# (eslint-config-next, fast-glob, micromatch for one braces advisory), and those entries carry no
# advisory of their own.
#
# A report it cannot read fails, the same as before: a gate that cannot see must not wave things
# through.
set -uo pipefail

report=${1:?usage: audit-gate.sh <audit.json> [<allowlist.json>] [<today>]}
allowlist=${2:-.github/audit-allowlist.json}
today=${3:-$(date -u +%F)}

if ! jq -e '.metadata.vulnerabilities.total' "$report" >/dev/null 2>&1; then
    echo "::error::npm audit did not return a usable report, failing closed"
    head -c 500 "$report" || true
    exit 1
fi

accepted='[]'
if [ -f "$allowlist" ]; then
    if ! accepted=$(jq -c --arg today "$today" \
        '[.[] | select(.id and .reason and .expires and (.expires >= $today)) | .id]' "$allowlist"); then
        echo "::error::$allowlist is not valid JSON, failing closed"
        exit 1
    fi
fi

# Every High or Critical advisory in the report, once each, as "severity<TAB>id<TAB>package".
found=$(jq -r '
    [.vulnerabilities[] | .via[] | objects
     | select(.severity == "critical" or .severity == "high")
     | {severity, id: (.url | split("/") | last), name}]
    | unique[] | "\(.severity)\t\(.id)\t\(.name)"' "$report")

failing=0
while IFS=$'\t' read -r severity id name; do
    [ -n "$id" ] || continue
    if jq -e --arg id "$id" 'index($id)' <<<"$accepted" >/dev/null; then
        echo "accepted until its expiry: $severity $id ($name)"
    else
        echo "::error::$severity $id ($name)"
        failing=$((failing + 1))
    fi
done <<<"$found"

echo "npm audit: $failing Critical or High advisories not accepted"
[ "$failing" -eq 0 ]
