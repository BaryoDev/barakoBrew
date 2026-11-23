#!/usr/bin/env bash
# Proves image-scan-gate.sh goes red on a report it must refuse and green on one it must pass.
#
#   bash scripts/test-image-scan-gate.sh
#
# The reports and allowlists are written to a scratch directory at run time. The ids are made up.
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
gate="$here/image-scan-gate.sh"
d=$(mktemp -d)
trap 'rm -rf "$d"' EXIT
today=2026-06-01
fail=0

# report NAME VULNS: an Alpine report whose os-pkgs result holds the given Vulnerabilities array.
report() {
    printf '{"SchemaVersion":2,"Metadata":{"OS":{"Family":"alpine","Name":"3.24.4"}},"Results":[{"Target":"t","Class":"os-pkgs","Vulnerabilities":%s}]}' "$2" >"$d/$1.json"
}

# expect NAME pass|fail [ALLOWLIST]
expect() {
    local code want=$2 allow=${3:-$d/none.json}
    bash "$gate" "$d/$1.json" "$allow" "$today" >/dev/null 2>&1
    code=$?
    if { [ "$want" = pass ] && [ "$code" -eq 0 ]; } || { [ "$want" = fail ] && [ "$code" -ne 0 ]; }; then
        echo "ok   $1 ($want)"
    else
        echo "FAIL $1: wanted $want, the gate exited $code"
        fail=$((fail + 1))
    fi
}

high_fixed='[{"VulnerabilityID":"CVE-2000-0001","PkgName":"libx","Severity":"HIGH","FixedVersion":"1.2.3"}]'
high_unfixed='[{"VulnerabilityID":"CVE-2000-0002","PkgName":"libx","Severity":"HIGH"}]'
low_fixed='[{"VulnerabilityID":"CVE-2000-0003","PkgName":"libx","Severity":"LOW","FixedVersion":"1.2.3"}]'

report clean null
report high-fixed "$high_fixed"
report high-unfixed "$high_unfixed"
report low-fixed "$low_fixed"
report empty-id '[{"VulnerabilityID":"","PkgName":"libx","Severity":"CRITICAL","FixedVersion":"1"}]'
echo 'not json' >"$d/invalid.json"
echo '{}' >"$d/no-schema.json"
echo '{"SchemaVersion":2}' >"$d/no-results.json"
echo '{"SchemaVersion":2,"Results":[]}' >"$d/empty-results.json"
printf '{"SchemaVersion":2,"Metadata":{"OS":{"Family":"alpine"}},"Results":[{"Target":"t","Class":"lang-pkgs"}]}' >"$d/no-os-pkgs.json"

printf '[{"id":"CVE-2000-0001","reason":"fixture","expires":"2026-12-31"}]' >"$d/allow.json"
printf '[{"id":"CVE-2000-0001","reason":"fixture","expires":"2026-01-01"}]' >"$d/expired.json"
printf '[{"id":"CVE-2000-0001","expires":"2026-12-31"}]' >"$d/no-reason.json"

expect clean pass
expect low-fixed pass
expect high-unfixed pass
expect high-fixed fail
expect high-fixed pass "$d/allow.json"
expect high-fixed fail "$d/expired.json"
expect high-fixed fail "$d/no-reason.json"
expect empty-id fail
expect missing fail
expect invalid fail
expect no-schema fail
expect no-results fail
expect empty-results fail
expect no-os-pkgs fail

if [ "$fail" -ne 0 ]; then
    echo "image scan gate self-test: $fail case(s) wrong"
    exit 1
fi
echo "image scan gate self-test: all cases right"
