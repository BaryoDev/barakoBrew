#!/bin/sh
set -eu

# next build resolves basePath and assetPrefix into the output, so the path a console is served
# under used to be fixed when the image was built. The published image is built against a
# placeholder prefix instead, and the real one is written in here, at start, from BARAKO_BASE_PATH.
# One image serves the domain root and any sub-path.
BASE_PATH_PLACEHOLDER="/__BARAKO_BASE_PATH__"

base_path="${BARAKO_BASE_PATH:-}"
while :; do
  case "$base_path" in
    */) base_path="${base_path%/}" ;;
    *) break ;;
  esac
done

# The value is substituted into JavaScript string literals, JSON and HTML attributes, so it is
# checked before it goes anywhere near them. Quotes, backslashes and spaces are not path characters.
if [ -n "$base_path" ] && ! printf '%s' "$base_path" | grep -Eq '^(/[A-Za-z0-9._~-]+)+$'; then
  echo "entrypoint: BARAKO_BASE_PATH must be one or more /segments of letters, digits, dot, underscore, tilde or hyphen. Got: ${BARAKO_BASE_PATH:-}" >&2
  exit 1
fi

# A build with a real basePath emits a 308 from "<basePath>/" to "<basePath>". Rewriting the
# placeholder to nothing would leave "/" redirecting to "", which breaks the domain root. A build
# with no basePath does not carry that redirect at all, so drop it to match.
if [ -z "$base_path" ] && [ -f .next/routes-manifest.json ]; then
  node -e '
const fs = require("fs");
const path = ".next/routes-manifest.json";
const placeholder = process.argv[1];
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
const redirects = manifest.redirects || [];
const kept = redirects.filter(
  (r) => !(r.internal && r.source === placeholder + "/" && r.destination === placeholder)
);
if (kept.length !== redirects.length) {
  manifest.redirects = kept;
  fs.writeFileSync(path, JSON.stringify(manifest, null, 2));
}
' "$BASE_PATH_PLACEHOLDER"
fi

placeholder_files=$(grep -rlF "$BASE_PATH_PLACEHOLDER" server.js .next 2>/dev/null || true)
if [ -n "$placeholder_files" ]; then
  printf '%s\n' "$placeholder_files" | while IFS= read -r file; do
    sed -i "s|$BASE_PATH_PLACEHOLDER|$base_path|g" "$file"
  done
  echo "entrypoint: serving under ${base_path:-/}"
elif [ -n "$base_path" ]; then
  echo "entrypoint: BARAKO_BASE_PATH is set to $base_path but this image has no runtime base path to write it into. It was built with NEXT_BASE_PATH baked in." >&2
fi

# public/env-config.js hands the NEXT_PUBLIC_ variables to the browser as window._env_. Only a name
# that starts with NEXT_PUBLIC_ is read, never a value, so a secret whose name or value merely
# contains the prefix stays on the server. Each value is written as a JSON string with "<" escaped,
# so a quote, backslash, newline or closing script tag stays inside the string it belongs to.
# Newlines survive as \n. A name with characters that cannot be a property name is left out, and
# said so, rather than breaking the file.
node -e '
const fs = require("fs");
const literal = (v) => JSON.stringify(v)
  .replace(/</g, "\\u003c")
  .replace(/\u2028/g, "\\u2028")
  .replace(/\u2029/g, "\\u2029");
let out = "window._env_ = {\n";
for (const name of Object.keys(process.env)) {
  if (!name.startsWith("NEXT_PUBLIC_")) continue;
  if (!/^NEXT_PUBLIC_[A-Za-z0-9_]*$/.test(name)) {
    console.error("entrypoint: left " + JSON.stringify(name) + " out of env-config.js, a name may hold only letters, digits and underscores");
    continue;
  }
  out += "  " + name + ": " + literal(process.env[name]) + ",\n";
}
fs.writeFileSync("./public/env-config.js", out + "};\n");
'

# Start the application
exec "$@"
