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

if ! [[ $today =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "::error::today must be YYYY-MM-DD, got '$today', failing closed"
    exit 1
fi

# Every entry needs an id, a reason and a YYYY-MM-DD expires. package is optional; when it is set it
# must be a non-empty string and the entry only accepts that package ("*" for any). An id of
# "unknown" names no advisory, so it is refused. A date that fits the pattern can still be
# impossible (2026-13-45), so it has to survive a round trip through a real calendar date.
accepted='[]'
if [ -f "$allowlist" ]; then
    if ! badnames=$(jq -r '
        def nes: type == "string" and length > 0;
        def valid:
            type == "object"
            and (.id | nes) and (.id != "unknown") and (.id | startswith("unknown:") | not)
            and (.reason | nes)
            and (.expires | type == "string" and test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$"))
            and ((try (.expires | strptime("%Y-%m-%d") | mktime | strftime("%Y-%m-%d")) catch "") == .expires)
            and ((has("package") | not) or (.package | nes));
        if type != "array" then "the file is not a JSON array"
        else to_entries[] | select(.value | valid | not)
             | "entry \(.key) (\(.value | tojson)) needs an id other than unknown, a reason, a real YYYY-MM-DD expires and, if set, a package"
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

# Every High or Critical advisory in the report, once each, as "severity<US>id<US>package" (US is
# the unit separator, so an empty field cannot collapse). An advisory with no url is listed by its
# npm source number, and one with neither is listed as "unknown:<package>", which no allowlist
# entry can match. An id or package that is empty, not a string, or holds a tab or newline fails.
if ! found=$(jq -r '
    [.vulnerabilities[] | .via[] | objects
     | select(.severity == "critical" or .severity == "high")
     | {severity, id: (((.url // .source // "") | tostring | split("/") | last) as $i
                       | if $i == "" then "unknown:\(.name)" else $i end), name}]
    | unique
    | map(if (.id | type == "string" and length > 0 and (test("[\t\n\r\u001f]") | not))
             and (.name | type == "string" and length > 0 and (test("[\t\n\r\u001f]") | not))
          then . else error("advisory with an empty or unreadable id or package") end)
    | .[] | "\(.severity)\u001f\(.id)\u001f\(.name)"' "$report"); then
    echo "::error::could not read the advisories in $report (an id or package is empty or holds a tab or newline), failing closed"
    exit 1
fi

# npm counts packages by severity. A count above zero with no advisory found means the report has
# a shape this script does not read, and a gate that cannot see must not pass. A count jq cannot
# read as a number fails too.
if ! counted=$(jq '(.metadata.vulnerabilities.high // 0) + (.metadata.vulnerabilities.critical // 0)' "$report") \
    || ! [[ $counted =~ ^[0-9]+$ ]]; then
    echo "::error::npm audit High or Critical counts in $report are not numbers, failing closed"
    exit 1
fi
if [ "$counted" -gt 0 ] && [ -z "$found" ]; then
    echo "::error::npm audit counts $counted High or Critical packages but no advisory was read, failing closed"
    exit 1
fi

failing=0
while IFS=$'\x1f' read -r severity id name; do
    [ -n "$id" ] || continue
    if jq -e --arg id "$id" --arg name "$name" \
        'any(.[]; .id == $id and ((.package // "*") == "*" or .package == $name))' <<<"$accepted" >/dev/null; then
        echo "accepted until its expiry: $severity $id ($name)"
    else
        echo "::error::$severity $id ($name)"
        failing=$((failing + 1))
    fi
done <<<"$found"

echo "npm audit: $failing Critical or High advisories not accepted"
[ "$failing" -eq 0 ]
