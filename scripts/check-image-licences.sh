#!/usr/bin/env bash
# What the published image redistributes, read out of the image itself.
#
# scripts/check-licences.sh reads the installed tree. That is the right question for what comes in
# and the wrong one for what goes out: the runtime image copies Next's traced `standalone` output,
# never `node_modules`, so the two answers are allowed to differ. #76 was that gap. sharp's LGPL
# libvips binaries arrive as an optional dependency of Next itself, the tree gate passed them with a
# carve-out, and 27MB of them were traced into the image nobody had looked inside.
#
#   scripts/check-image-licences.sh --image barako-admin:ci
#   scripts/check-image-licences.sh --dir .next/standalone/node_modules
#   scripts/check-image-licences.sh --dir scripts/testdata/image-licences-known-bad   # must fail
#
# Refuses by licence pattern rather than by an allow list, on purpose. The allow list belongs on the
# way in, where a new dependency is a decision someone is making. This one answers a narrower
# question, "is there copyleft in the artifact", and a pattern says that without turning every
# unusual SPDX string in a transitive package into a release blocker.

set -uo pipefail

cd "$(dirname "$0")/.."

REFUSED='GPL|AGPL|LGPL|SSPL|BUSL|BSL-1\.1|Elastic-|Commons-Clause|CC-BY-NC|PolyForm'

MODE=""
TARGET=""
while [ $# -gt 0 ]; do
    case "$1" in
        --image) MODE=image; TARGET="${2:-}"; shift 2 ;;
        --dir)   MODE=dir;   TARGET="${2:-}"; shift 2 ;;
        *) echo "usage: $0 --image <ref> | --dir <path>" >&2; exit 2 ;;
    esac
done
[ -n "$MODE" ] && [ -n "$TARGET" ] || { echo "usage: $0 --image <ref> | --dir <path>" >&2; exit 2; }

CLEANUP=""
trap 'rm -rf $CLEANUP' EXIT

if [ "$MODE" = image ]; then
    WORK=$(mktemp -d)
    CLEANUP="$WORK"
    # Copied out rather than scanned with a shell inside the container, so both modes run the same
    # code over the same shape of input and the fixture test proves the real path.
    cid=$(docker create "$TARGET") || { echo "::error::cannot create a container from $TARGET"; exit 1; }
    docker cp "$cid:/app/node_modules" "$WORK/node_modules" >/dev/null 2>&1 || {
        docker rm -f "$cid" >/dev/null 2>&1
        echo "::error::$TARGET has no /app/node_modules to read"; exit 1; }
    docker rm -f "$cid" >/dev/null 2>&1
    TREE="$WORK/node_modules"
else
    TREE="$TARGET"
fi

[ -d "$TREE" ] || { echo "::error::$TREE does not exist. Build first."; exit 1; }

REPORT=$(mktemp)
CLEANUP="$CLEANUP $REPORT"

python3 - "$TREE" > "$REPORT" <<'PY'
import json, os, sys

root = sys.argv[1]
for dirpath, dirnames, filenames in os.walk(root):
    if 'package.json' not in filenames:
        continue
    path = os.path.join(dirpath, 'package.json')
    try:
        with open(path, encoding='utf-8') as fh:
            pkg = json.load(fh)
    except Exception:
        # A package.json that will not parse is reported, not skipped. Unreadable must not mean clean.
        print(f"{os.path.relpath(dirpath, root)}\tUNREADABLE")
        continue
    name = pkg.get('name') or os.path.relpath(dirpath, root)
    lic = pkg.get('license') or pkg.get('licence')
    if isinstance(lic, dict):
        lic = lic.get('type', 'UNKNOWN')
    if not lic and isinstance(pkg.get('licenses'), list):
        lic = ' OR '.join(x.get('type', str(x)) if isinstance(x, dict) else str(x) for x in pkg['licenses'])
    print(f"{name}\t{lic or 'UNKNOWN'}")
PY

COUNT=$(wc -l < "$REPORT" | tr -d ' ')
# A tool that produced nothing must not wave an artifact through, same reasoning as the audit gate.
[ "$COUNT" -gt 0 ] || { echo "::error::read no packages out of $TREE, refusing to call it clean"; exit 1; }

HITS=$(grep -Ei "	.*($REFUSED)" "$REPORT" || true)
if [ -n "$HITS" ]; then
    echo "::error::the artifact ships a refused licence:"
    echo "$HITS" | sed 's/^/  /'
    echo
    echo "Inspected $COUNT packages. See #80 before adding an exception."
    exit 1
fi

echo "$COUNT packages in the artifact, no copyleft."
