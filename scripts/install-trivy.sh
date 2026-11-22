#!/usr/bin/env bash
# Installs the pinned Trivy release into /usr/local/bin, after checking the download against a
# checksum written here. The checksums come from the release's own trivy_<version>_checksums.txt.
# Bumping the version means taking the two lines from that file in the same change.
set -euo pipefail

VERSION=0.76.2
case "$(uname -m)" in
    x86_64)  FILE="trivy_${VERSION}_Linux-64bit.tar.gz"; SHA256=bc0fc726e017b8927a62b2d3531d7a84ee01769daf5c99ed866dced54089fdbf ;;
    aarch64) FILE="trivy_${VERSION}_Linux-ARM64.tar.gz"; SHA256=ab9d51f86e6a5fb936f605faff6b593ac51bc378fff4d3e8b9d58358b9c367c3 ;;
    *) echo "::error::no pinned Trivy build for $(uname -m)"; exit 1 ;;
esac

tmp=$(mktemp -d)
curl -sSL --fail -o "$tmp/trivy.tar.gz" \
    "https://github.com/aquasecurity/trivy/releases/download/v${VERSION}/${FILE}"
# Verified before it is extracted, so an unauthenticated binary never runs in a job holding a token.
echo "${SHA256}  $tmp/trivy.tar.gz" | sha256sum -c -
sudo tar -xzf "$tmp/trivy.tar.gz" -C /usr/local/bin trivy
rm -rf "$tmp"
trivy --version
