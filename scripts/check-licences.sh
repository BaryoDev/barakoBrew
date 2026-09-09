#!/usr/bin/env bash
# Refuses a dependency whose licence is not on the allow list (#39).
#
# MPL-2.0 is file-level copyleft and §3.3 permits combining MPL files into a Larger Work under
# other terms, so permissive dependencies are fine and the line to hold is narrower than "MIT only".
# What must never enter the tree is GPL, AGPL, LGPL, SSPL, BUSL, Elastic, "fair source", or a
# package with no machine-readable licence field. AGPL is the one that costs money later: CLA.md
# names it as what enterprise buyers refuse, and the console is the part a company deploys.
#
#   bash scripts/check-licences.sh [tree-path] [minimum-packages]
#
# tree-path is a directory holding an installed node_modules, default the working directory.
# minimum-packages is the floor the report must reach before it is believed, default 1. Exit 1 on a
# refused licence or on a report that cannot be read.
#
# license-checker-rseidelsohn rather than license-compliance, which #39 also suggested.
# license-compliance walks each package.json's `dependencies` and never descends into
# `optionalDependencies`, so it called this tree clean while eleven LGPL-3.0-or-later
# `@img/sharp-libvips-*` packages sat in node_modules. This one reads what is on disk, which is
# what "enters the tree" means.
#
# Pinned to 4.4.2 because 5.x requires Node 24 and every job here runs Node 22.
set -euo pipefail

TREE="${1:-.}"
MIN_PACKAGES="${2:-1}"

# The list decided in #39, plus a second group the whole-tree scan turned up. The audit in that
# issue read the direct dependencies only, so it did not see these. Each is permissive and none is
# copyleft: 0BSD and MIT-0 are BSD and MIT with the attribution clause dropped, BlueOak-1.0.0 and
# Python-2.0 are OSI-approved permissive licences, and CC-BY-4.0 covers caniuse-lite, which is a
# browser-support data table rather than code.
ALLOWED='[
  "MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "MPL-2.0", "Unlicense", "CC0-1.0",
  "0BSD", "MIT-0", "BlueOak-1.0.0", "Python-2.0", "CC-BY-4.0"
]'

# The one refused licence already in the tree, carved out by package name rather than by adding
# LGPL to the list above, so a new LGPL dependency still fails.
#
# These are the prebuilt libvips binaries that sharp loads, and sharp is an optional dependency of
# Next.js itself, so they arrive with the framework rather than with anything written here. They are
# native libraries loaded at runtime, never inlined by a bundler, which is the case LGPL's linking
# allowance is written for and the case #39's blanket refusal of LGPL was not weighing.
#
# The carve-out is about this tree, not about the artifact. They used to be the same answer: the
# binaries were traced into .next/standalone and shipped (#76). They are excluded from tracing now,
# so nothing published carries them, and scripts/check-image-licences.sh reads the image to say so
# rather than inferring it from here. Printed on every run anyway, because an exception nobody sees
# is an exception nobody revisits.
EXCEPTIONS='["@img/sharp-libvips-", "@img/sharp-win32-", "@img/sharp-wasm32"]'

REPORT=$(mktemp)
trap 'rm -f "$REPORT"' EXIT

# --excludePrivatePackages drops the repository's own package.json, which is `"private": true` and
# so reports UNLICENSED. The gate is about what comes in, not about what this repository is.
npx --yes license-checker-rseidelsohn@4.4.2 --json --excludePrivatePackages \
    --start "$TREE" --out "$REPORT" \
    || { echo "::error::the licence report could not be generated for $TREE"; exit 1; }

# A tool that writes nothing still exits 0, and a report nobody can read must not wave a tree
# through. Same reasoning as the npm audit gate: a check that cannot see fails closed.
COUNT=$(jq -r 'if type == "object" then length else empty end' "$REPORT" 2>/dev/null || true)
case "$COUNT" in
    ''|*[!0-9]*) echo "::error::the licence report for $TREE is not readable JSON"; head -c 500 "$REPORT" || true; exit 1 ;;
esac
if [ "$COUNT" -lt "$MIN_PACKAGES" ]; then
    echo "::error::the licence report lists $COUNT packages, below the floor of $MIN_PACKAGES"
    exit 1
fi

# `licenses` is a string for almost everything and an array for the few packages still using the
# deprecated `licenses: []` field. Flatten before comparing, or those compare against nothing.
#
# One pass over the report classifies every package, so the carve-outs and the refusals cannot
# disagree about which rule matched a package.
VERDICTS=$(jq -r --argjson allowed "$ALLOWED" --argjson exceptions "$EXCEPTIONS" '
    to_entries[]
    | .key as $pkg
    | ((.value.licenses // "UNKNOWN")
       | if type == "array" then join(" AND ") else tostring end) as $licence
    | if ($allowed | index($licence)) then "allowed"
      elif any($exceptions[]; . as $prefix | $pkg | startswith($prefix)) then "excepted"
      else "refused" end
    | "\(.)\t\($pkg)\t\($licence)"
' "$REPORT")

echo "$TREE: $COUNT packages checked"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    echo "licences: $COUNT packages checked in $TREE" >> "$GITHUB_STEP_SUMMARY"
fi

# An exception nobody sees is an exception nobody revisits.
printf '%s\n' "$VERDICTS" | awk -F'\t' '$1 == "excepted" { print "known exception: " $2 " (" $3 ")" }'

REFUSED=$(printf '%s\n' "$VERDICTS" | awk -F'\t' '$1 == "refused" { print $2 "\t" $3 }')
if [ -n "$REFUSED" ]; then
    while IFS=$'\t' read -r pkg licence; do
        echo "::error::$pkg is $licence, which is not on the licence allow list"
    done <<< "$REFUSED"
    echo "See CONTRIBUTING.md, 'Adding a dependency', for the list and what to do about a refusal."
    exit 1
fi

echo "$TREE: every licence is on the allow list"
