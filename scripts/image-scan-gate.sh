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

if ! [[ $today =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "::error::today must be YYYY-MM-DD, got '$today', failing closed"
    exit 1
fi

# Every entry needs an id, a reason and a YYYY-MM-DD expires. package is optional; when it is set it
# must be a non-empty string and the entry only accepts that package ("*" for any). A date that fits
# the pattern can still be impossible (2026-13-45), so it has to survive a round trip through a real
# calendar date.
accepted='[]'
if [ -f "$allowlist" ]; then
    if ! badnames=$(jq -r '
        def nes: type == "string" and length > 0;
        def valid:
            type == "object"
            and (.id | nes)
            and (.reason | nes)
            and (.expires | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$"))
            and ((try (.expires | strptime("%Y-%m-%d") | mktime | strftime("%Y-%m-%d")) catch "") == .expires)
            and ((has("package") | not) or (.package | nes));
        if type != "array" then "the file is not a JSON array"
        else to_entries[] | select(.value | valid | not)
             | "entry \(.key) (\(.value | tojson)) needs an id, a reason, a real YYYY-MM-DD expires and, if set, a package"
        end' "$allowlist"); then
        echo "::error::$allowlist is not valid JSON, failing closed"
        exit 1
    fi
    if [ -n "$badnames" ]; then
        while IFS= read -r line; do
            echo "::error::allowlist $line"
        done <<<"$badnames"
        exit 1
    fi
    accepted=$(jq -c --arg today "$today" '[.[] | select(.expires >= $today)]' "$allowlist")
fi

# "severity<US>id<US>package<US>fixed version", once each (US is the unit separator, so an empty
# field cannot collapse). An empty fixed version means no fix. A High or Critical finding whose id
# or package is empty, not a string, or holds a tab or newline fails the gate.
if ! found=$(jq -r '
    [.Results[]? | .Vulnerabilities[]?
     | select(.Severity == "CRITICAL" or .Severity == "HIGH")
     | {severity: .Severity, id: .VulnerabilityID, name: .PkgName, fixed: (.FixedVersion // "")}]
    | unique
    | map(if (.id | type == "string" and length > 0 and (test("[\t\n\r\u001f]") | not))
             and (.name | type == "string" and length > 0 and (test("[\t\n\r\u001f]") | not))
             and (.fixed | type == "string" and (test("[\t\n\r\u001f]") | not))
          then . else error("finding with an empty or unreadable id or package") end)
    | .[] | "\(.severity)\u001f\(.id)\u001f\(.name)\u001f\(.fixed)"' "$report"); then
    echo "::error::could not read the findings in $report (an id or package is empty or holds a tab or newline), failing closed"
    exit 1
fi

failing=0
unfixed=0
while IFS=$'\x1f' read -r severity id name fixed; do
    [ -n "$id" ] || continue
    if [ -z "$fixed" ]; then
        echo "::notice::no fix yet, reported only: $severity $id ($name)"
        unfixed=$((unfixed + 1))
    elif jq -e --arg id "$id" --arg name "$name" \
        'any(.[]; .id == $id and ((.package // "*") == "*" or .package == $name))' <<<"$accepted" >/dev/null; then
        echo "accepted until its expiry: $severity $id ($name, fixed in $fixed)"
    else
        echo "::error::$severity $id ($name, fixed in $fixed)"
        failing=$((failing + 1))
    fi
done <<<"$found"

echo "image scan: $failing High or Critical with a fix not accepted, $unfixed with no fix reported"
[ "$failing" -eq 0 ]
