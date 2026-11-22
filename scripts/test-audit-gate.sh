#!/usr/bin/env bash
# Checks scripts/audit-gate.sh against fixed reports, so the gate's rules hold without the registry.
set -uo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
pass=0; fail=0
check() { # name, expected rc, args...
    local name=$1 want=$2; shift 2
    bash scripts/audit-gate.sh "$@" >"$T/out" 2>&1; local got=$?
    if [ "$got" -eq "$want" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL: $name (rc $got, wanted $want)"; cat "$T/out"; fi
}
cat >"$T/report.json" <<'J'
{"metadata":{"vulnerabilities":{"high":3,"critical":0,"total":3}},
 "vulnerabilities":{
  "braces":{"severity":"high","via":[{"severity":"high","name":"braces","url":"https://github.com/advisories/GHSA-aaaa-bbbb-cccc"}]},
  "micromatch":{"severity":"high","via":["braces"]},
  "fast-glob":{"severity":"high","via":["micromatch"]}}}
J
cat >"$T/allow.json" <<'J'
[{"id":"GHSA-aaaa-bbbb-cccc","package":"braces","reason":"test","expires":"2026-11-04"}]
J
jq '.vulnerabilities.foo={"severity":"critical","via":[{"severity":"critical","name":"foo","url":"https://github.com/advisories/GHSA-xxxx-yyyy-zzzz"}]}' "$T/report.json" >"$T/extra.json"
echo '{"metadata":{"vulnerabilities":{"total":0}},"vulnerabilities":{}}' >"$T/clean.json"
echo '<html>503</html>' >"$T/bad.json"
echo '{' >"$T/badallow.json"
jq '.vulnerabilities.foo={"severity":"high","via":[{"severity":"high","name":"foo","source":1099999}]}' "$T/clean.json" >"$T/nourl.json"
jq '.vulnerabilities.foo={"severity":"high","via":[{"severity":"high","name":"foo","url":7}]}' "$T/clean.json" >"$T/badurl.json"
echo '{"metadata":{"vulnerabilities":{"high":2,"total":2}},"vulnerabilities":{"foo":{"severity":"high","via":["bar"]}}}' >"$T/unread.json"
echo '[{"id":"GHSA-aaaa-bbbb-cccc","expires":"2026-11-04"}]' >"$T/noreason.json"

check "a clean report passes"                       0 "$T/clean.json" "$T/allow.json" 2026-10-04
check "an accepted advisory passes"                 0 "$T/report.json" "$T/allow.json" 2026-10-04
check "an accepted advisory passes on its expiry"   0 "$T/report.json" "$T/allow.json" 2026-11-04
check "it fails the day after the expiry"           1 "$T/report.json" "$T/allow.json" 2026-11-05
check "with no allowlist it fails"                  1 "$T/report.json" "$T/none.json" 2026-10-04
check "another advisory still fails"                1 "$T/extra.json" "$T/allow.json" 2026-10-04
check "an unreadable report fails closed"           1 "$T/bad.json" "$T/allow.json" 2026-10-04
check "an unreadable allowlist fails closed"        1 "$T/report.json" "$T/badallow.json" 2026-10-04
check "an entry with no reason accepts nothing"     1 "$T/report.json" "$T/noreason.json" 2026-10-04
check "an advisory with no url still fails"         1 "$T/nourl.json" "$T/allow.json" 2026-10-04
check "an advisory with a non-string url fails"     1 "$T/badurl.json" "$T/allow.json" 2026-10-04
check "a High count with no advisory read fails"    1 "$T/unread.json" "$T/allow.json" 2026-10-04

# The image scan gate reads a Trivy report and the same allowlist.
image_check() { # name, expected rc, args...
    local name=$1 want=$2; shift 2
    bash scripts/image-scan-gate.sh "$@" >"$T/out" 2>&1; local got=$?
    if [ "$got" -eq "$want" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL: $name (rc $got, wanted $want)"; cat "$T/out"; fi
}
cat >"$T/image.json" <<'J'
{"SchemaVersion":2,"Results":[{"Target":"alpine","Vulnerabilities":[
 {"VulnerabilityID":"CVE-2099-0001","PkgName":"busybox","Severity":"HIGH","FixedVersion":"1.37.1"},
 {"VulnerabilityID":"CVE-2099-0002","PkgName":"zlib","Severity":"LOW","FixedVersion":"1.3.2"}]}]}
J
cat >"$T/image-unfixed.json" <<'J'
{"SchemaVersion":2,"Results":[{"Target":"alpine","Vulnerabilities":[
 {"VulnerabilityID":"CVE-2099-0003","PkgName":"openssl","Severity":"CRITICAL"}]}]}
J
echo '{"SchemaVersion":2}' >"$T/image-clean.json"
echo '[{"id":"CVE-2099-0001","expires":"2026-11-04"}]' >"$T/image-noreason.json"
cat >"$T/image-allow.json" <<'J'
[{"id":"CVE-2099-0001","package":"busybox","reason":"test","expires":"2026-11-04"}]
J

image_check "a clean image report passes"                      0 "$T/image-clean.json" "$T/image-allow.json" 2026-10-04
image_check "a fixable High finding fails"                     1 "$T/image.json" "$T/none.json" 2026-10-04
image_check "an allowlisted finding passes"                    0 "$T/image.json" "$T/image-allow.json" 2026-10-04
image_check "an allowlisted finding passes on its expiry"      0 "$T/image.json" "$T/image-allow.json" 2026-11-04
image_check "an expired allowlist entry fails"                 1 "$T/image.json" "$T/image-allow.json" 2026-11-05
image_check "a Critical finding with no fix is reported only"  0 "$T/image-unfixed.json" "$T/none.json" 2026-10-04
image_check "an unreadable report fails closed"                1 "$T/bad.json" "$T/image-allow.json" 2026-10-04
image_check "an unreadable allowlist fails closed"             1 "$T/image.json" "$T/badallow.json" 2026-10-04
image_check "an entry with no reason accepts nothing"          1 "$T/image.json" "$T/image-noreason.json" 2026-10-04
echo '{"SchemaVersion":2,"Results":[{"Target":"alpine","Vulnerabilities":{"VulnerabilityID":"CVE-2099-0004","Severity":"HIGH","FixedVersion":"1"}}]}' >"$T/image-odd.json"
image_check "a findings list it cannot read fails closed"      1 "$T/image-odd.json" "$T/none.json" 2026-10-04
# The caller job in ci-branch.yml must grant what every job in ci.yml declares.
perm_check() { # name, expected rc, caller file
    local name=$1 want=$2 caller=$3
    python3 scripts/check-workflow-permissions.py scripts/testdata/workflow-permissions/called.yml "scripts/testdata/workflow-permissions/$caller" >"$T/out" 2>&1; local got=$?
    if [ "$got" -eq "$want" ]; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL: $name (rc $got, wanted $want)"; cat "$T/out"; fi
}
perm_check "a caller with the full union passes"                       0 caller-ok.yml
perm_check "the old caller pairing, missing packages and security-events, fails" 1 caller-master.yml
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
