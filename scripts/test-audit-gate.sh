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
echo '{"metadata":{"vulnerabilities":{"high":0,"critical":0,"total":0}},"vulnerabilities":{}}' >"$T/clean.json"
echo '<html>503</html>' >"$T/bad.json"
echo '{' >"$T/badallow.json"
jq '.vulnerabilities.foo={"severity":"high","via":[{"severity":"high","name":"foo","source":1099999}]}' "$T/clean.json" >"$T/nourl.json"
jq '.vulnerabilities.foo={"severity":"high","via":[{"severity":"high","name":"foo","url":7}]}' "$T/clean.json" >"$T/badurl.json"
echo '{"metadata":{"vulnerabilities":{"high":2,"critical":0,"total":2}},"vulnerabilities":{"foo":{"severity":"high","via":["bar"]}}}' >"$T/unread.json"
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

# Allowlist dates are checked as dates, not compared as strings.
for bad in never 9 2099-13-45 2099-02-30 "2099-1-1"; do
    printf '[{"id":"GHSA-aaaa-bbbb-cccc","package":"braces","reason":"test","expires":"%s"}]\n' "$bad" >"$T/baddate.json"
    check "an expiry of $bad accepts nothing"       1 "$T/report.json" "$T/baddate.json" 2026-10-04
done
echo '[{"id":"GHSA-aaaa-bbbb-cccc","package":"braces","reason":"test","expires":20991231}]' >"$T/numdate.json"
check "a numeric expiry accepts nothing"            1 "$T/report.json" "$T/numdate.json" 2026-10-04
echo '[{"id":"GHSA-aaaa-bbbb-cccc","package":"braces","reason":"","expires":"2099-12-31"}]' >"$T/emptyreason.json"
check "an empty reason accepts nothing"             1 "$T/report.json" "$T/emptyreason.json" 2026-10-04
echo '{"id":"GHSA-aaaa-bbbb-cccc","reason":"x","expires":"2099-12-31"}' >"$T/notarray.json"
check "an allowlist that is not an array fails"     1 "$T/report.json" "$T/notarray.json" 2026-10-04
named=$(bash scripts/audit-gate.sh "$T/report.json" "$T/baddate.json" 2026-10-04 2>&1)
if grep -q 'entry 0 .*GHSA-aaaa-bbbb-cccc.*2099-1-1' <<<"$named"; then pass=$((pass + 1)); else fail=$((fail + 1)); echo "FAIL: a bad entry is named"; fi

# A count that is not a number fails, even when the advisory itself is accepted.
jq '.metadata.vulnerabilities.high="3"' "$T/report.json" >"$T/strcount.json"
check "a string High count fails closed"            1 "$T/strcount.json" "$T/allow.json" 2026-10-04

# High and Critical counts must both be present nonnegative integers; anything else is unreadable.
jq '.metadata.vulnerabilities.high=false' "$T/clean.json" >"$T/c-false.json"
jq '.metadata.vulnerabilities.critical=-1' "$T/clean.json" >"$T/c-neg.json"
jq '.metadata.vulnerabilities.high=1.5' "$T/clean.json" >"$T/c-frac.json"
jq 'del(.metadata.vulnerabilities.high)' "$T/clean.json" >"$T/c-missing.json"
jq '.metadata.vulnerabilities.high="3"' "$T/clean.json" >"$T/c-str.json"
check "a High count of false fails closed"          1 "$T/c-false.json" "$T/allow.json" 2026-10-04
check "a negative Critical count fails closed"      1 "$T/c-neg.json" "$T/allow.json" 2026-10-04
check "a fractional High count fails closed"        1 "$T/c-frac.json" "$T/allow.json" 2026-10-04
check "a missing High count fails closed"           1 "$T/c-missing.json" "$T/allow.json" 2026-10-04
check "a string High count on a clean report fails" 1 "$T/c-str.json" "$T/allow.json" 2026-10-04

# An advisory with no url and no source is "unknown", and no entry may accept that.
jq '.vulnerabilities.foo={"severity":"high","via":[{"severity":"high","name":"foo"}]}' "$T/clean.json" >"$T/noid.json"
echo '[{"id":"unknown","reason":"x","expires":"2099-12-31"}]' >"$T/allow-unknown.json"
echo '[{"id":"unknown","package":"foo","reason":"x","expires":"2099-12-31"}]' >"$T/allow-unknown2.json"
echo '[{"id":"unknown:foo","package":"foo","reason":"x","expires":"2099-12-31"}]' >"$T/allow-unknown3.json"
check "an advisory with no id is not accepted by unknown"    1 "$T/noid.json" "$T/allow-unknown.json" 2026-10-04
check "unknown with a package does not accept it either"     1 "$T/noid.json" "$T/allow-unknown2.json" 2026-10-04
check "an unknown:<package> entry does not accept it"        1 "$T/noid.json" "$T/allow-unknown3.json" 2026-10-04

# An entry that names a package only accepts that package.
echo '[{"id":"GHSA-aaaa-bbbb-cccc","package":"other","reason":"x","expires":"2099-12-31"}]' >"$T/allow-otherpkg.json"
check "an entry for another package accepts nothing" 1 "$T/report.json" "$T/allow-otherpkg.json" 2026-10-04
echo '[{"id":"GHSA-aaaa-bbbb-cccc","reason":"x","expires":"2099-12-31"}]' >"$T/allow-nopkg.json"
check "an entry with no package still accepts the id" 0 "$T/report.json" "$T/allow-nopkg.json" 2026-10-04

# An empty package name or a newline in it must not shift columns or split a row.
jq '.vulnerabilities.braces.via[0].name=""' "$T/report.json" >"$T/emptyname.json"
jq '.vulnerabilities.braces.via[0].name="braces\nx"' "$T/report.json" >"$T/nlname.json"
jq '.vulnerabilities.braces.via[0].name="bra\tces"' "$T/report.json" >"$T/tabname.json"
check "an empty package name fails"                 1 "$T/emptyname.json" "$T/allow-nopkg.json" 2026-10-04
check "a newline in a package name fails"           1 "$T/nlname.json" "$T/allow-nopkg.json" 2026-10-04
check "a tab in a package name fails"               1 "$T/tabname.json" "$T/allow-nopkg.json" 2026-10-04

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
# A High with a fix and an empty, tab or newline id or package must fail, not shift columns.
img_one() { printf '{"SchemaVersion":2,"Results":[{"Vulnerabilities":[{"VulnerabilityID":"%s","PkgName":"%s","Severity":"HIGH","FixedVersion":"1.0"}]}]}\n' "$1" "$2"; }
img_one "CVE-2099-0009" ""            >"$T/image-nopkg.json"
img_one ""              "busybox"     >"$T/image-noid.json"
img_one 'CVE-2099-0001\nx' "busybox"  >"$T/image-nlid.json"
img_one "CVE-2099-0001" 'busy\tbox'   >"$T/image-tabpkg.json"
image_check "a High with an empty package name fails"          1 "$T/image-nopkg.json" "$T/none.json" 2026-10-04
image_check "a High with an empty id fails"                    1 "$T/image-noid.json" "$T/none.json" 2026-10-04
image_check "a High with a newline in its id fails"            1 "$T/image-nlid.json" "$T/none.json" 2026-10-04
image_check "a High with a tab in its package fails"           1 "$T/image-tabpkg.json" "$T/none.json" 2026-10-04
# The same fixable finding is not accepted by an entry for another package.
echo '[{"id":"CVE-2099-0001","package":"other","reason":"x","expires":"2099-12-31"}]' >"$T/image-otherpkg.json"
image_check "an entry for another package accepts nothing"     1 "$T/image.json" "$T/image-otherpkg.json" 2026-10-04
# Allowlist dates are checked as dates, not compared as strings.
for bad in never 9 2099-13-45 2099-02-30; do
    printf '[{"id":"CVE-2099-0001","package":"busybox","reason":"test","expires":"%s"}]\n' "$bad" >"$T/image-baddate.json"
    image_check "an expiry of $bad accepts nothing"            1 "$T/image.json" "$T/image-baddate.json" 2026-10-04
done
echo '[{"id":"CVE-2099-0001","package":"busybox","reason":"","expires":"2099-12-31"}]' >"$T/image-emptyreason.json"
image_check "an empty reason accepts nothing"                  1 "$T/image.json" "$T/image-emptyreason.json" 2026-10-04
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
