#!/usr/bin/env bash
# Fails when a Trivy image report holds a High or Critical vulnerability that has a fix and is not
# accepted.
#
#   scripts/image-scan-gate.sh <trivy.json> [<allowlist.json>] [<today YYYY-MM-DD>]
#
# The report comes from `trivy image --scanners vuln --format json`. A finding with no fixed
# version is reported and never fails, because nothing can be done about it and a gate that blocks
# a publish on that is one people learn to bypass. A finding with a fix fails unless its id (the CVE
# or GHSA id) is in the allowlist (default .github/audit-allowlist.json, the file the npm audit gate
# reads) with a reason and an expiry date that has not passed. An expired entry accepts nothing.
#
# A report it cannot read fails: a gate that cannot see must not wave things through.
set -uo pipefail

report=${1:?usage: image-scan-gate.sh <trivy.json> [<allowlist.json>] [<today>]}
allowlist=${2:-.github/audit-allowlist.json}
today=${3:-$(date -u +%F)}

# Results is absent from a report with nothing in it, so the schema version is the shape check.
if ! jq -e '(.SchemaVersion | type) == "number" and ((.Results // []) | type) == "array"' "$report" >/dev/null 2>&1; then
    echo "::error::the image scan did not return a usable report, failing closed"
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

# "severity<TAB>id<TAB>package<TAB>fixed version", once each. An empty fixed version means no fix.
found=$(jq -r '
    [.Results[]? | .Vulnerabilities[]?
     | select(.Severity == "CRITICAL" or .Severity == "HIGH")
     | {severity: .Severity, id: .VulnerabilityID, name: .PkgName, fixed: (.FixedVersion // "")}]
    | unique[] | "\(.severity)\t\(.id)\t\(.name)\t\(.fixed)"' "$report")

failing=0
unfixed=0
while IFS=$'\t' read -r severity id name fixed; do
    [ -n "$id" ] || continue
    if [ -z "$fixed" ]; then
        echo "::notice::no fix yet, reported only: $severity $id ($name)"
        unfixed=$((unfixed + 1))
    elif jq -e --arg id "$id" 'index($id)' <<<"$accepted" >/dev/null; then
        echo "accepted until its expiry: $severity $id ($name, fixed in $fixed)"
    else
        echo "::error::$severity $id ($name, fixed in $fixed)"
        failing=$((failing + 1))
    fi
done <<<"$found"

echo "image scan: $failing High or Critical with a fix not accepted, $unfixed with no fix reported"
[ "$failing" -eq 0 ]
