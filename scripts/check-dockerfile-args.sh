#!/usr/bin/env bash
# Refuses a build ARG the Dockerfile has not declared a reason for.
#
# The base path was a build ARG, so serving the console at /barakocms meant building a second image
# and publishing it under its own tag (#167). That is the thing this repository is meant not to do:
# every site runs the same published image and only configuration differs. A build input that
# changes what the image serves brings the whole problem straight back, and it arrives as one
# innocent-looking line in a Dockerfile.
#
# So the ARGs are an allowlist. Adding one is a deliberate decision that belongs in a pull request,
# not a diff nobody reads. If the new input changes routing, what is served, or where the console
# talks to, it should be an environment variable entrypoint.sh reads at container start instead.
#
#   bash scripts/check-dockerfile-args.sh [dockerfile ...]
#
# Exit 1 naming any ARG that is not on the list. With no argument it reads every Dockerfile at the
# repository root, so adding a second one does not quietly escape the check.
set -uo pipefail

if [ "$#" -gt 0 ]; then
    FILES=("$@")
else
    cd "$(dirname "$0")/.."
    mapfile -t FILES < <(find . -maxdepth 1 -name 'Dockerfile*' -type f | sort)
fi

if [ "${#FILES[@]}" -eq 0 ]; then
    echo "$0: found no Dockerfile to read" >&2
    exit 2
fi

for file in "${FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "$0: no such file: $file" >&2
        exit 2
    fi
done

# Each of these is a build input on purpose. The reason is the price of being on the list.
#
#   NEXT_PUBLIC_API_URL  a default only. entrypoint.sh rewrites it at start through env-config.js,
#                        so repointing the console at another API never needs a rebuild.
#   NEXT_BASE_PATH       the placeholder the runtime base path is written over, or a real path for
#                        anyone who still wants it baked in. entrypoint.sh reads BARAKO_BASE_PATH.
#   BARAKO_VERSION       what the image is tagged with, so a running container can say what it is.
#   BARAKO_IMAGE         the published digest Dockerfile.playground puts its one ENV line on. It
#                        picks the base image, it does not change what that image serves.
ALLOWED=(
    NEXT_PUBLIC_API_URL
    NEXT_BASE_PATH
    BARAKO_VERSION
    BARAKO_IMAGE
)

TOTAL=0
UNKNOWN=()

for file in "${FILES[@]}"; do
    mapfile -t FOUND < <(grep -oE '^[[:space:]]*ARG[[:space:]]+[A-Za-z_][A-Za-z0-9_]*' "$file" \
        | awk '{ print $2 }' | sort -u)
    TOTAL=$((TOTAL + ${#FOUND[@]}))

    for arg in "${FOUND[@]}"; do
        known=0
        for allowed in "${ALLOWED[@]}"; do
            [ "$arg" = "$allowed" ] && known=1 && break
        done
        [ "$known" -eq 1 ] || UNKNOWN+=("$file: ARG $arg")
    done

    echo "$file: ${FOUND[*]:-no build ARGs}"
done

if [ "$TOTAL" -eq 0 ]; then
    echo "$0: found no ARG at all, which means this check is reading the wrong thing" >&2
    exit 2
fi

if [ "${#UNKNOWN[@]}" -gt 0 ]; then
    echo >&2
    echo "A build ARG this repository has not agreed to:" >&2
    for entry in "${UNKNOWN[@]}"; do
        echo "  $entry" >&2
    done
    echo >&2
    echo "A build input that changes what the image serves means a second image per deployment," >&2
    echo "which is what #167 removed. Make it an environment variable entrypoint.sh reads at" >&2
    echo "container start. If it genuinely has to be a build input, add it to ALLOWED in" >&2
    echo "scripts/check-dockerfile-args.sh with the reason, and say so in the pull request." >&2
    exit 1
fi

echo "every build ARG is one this repository agreed to"
