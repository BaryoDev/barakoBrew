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
# grep tests line by line, so a value with a newline in it would pass for its first line. Any value
# that is not one line is refused before the pattern is tried.
nl='
'
multiline=0
case "$base_path" in
  *"$nl"*) multiline=1 ;;
esac
if [ -n "$base_path" ] && { [ "$multiline" = 1 ] || ! printf '%s' "$base_path" | grep -Eq '^(/[A-Za-z0-9._~-]+)+$'; }; then
  echo "entrypoint: BARAKO_BASE_PATH must be one or more /segments of letters, digits, dot, underscore, tilde or hyphen. Got: ${BARAKO_BASE_PATH:-}" >&2
  exit 1
fi

# Everything below rewrites files: the base path and the policy origins go into the build output and
# the API address goes into public/env-config.js. With BARAKO_RUNTIME_DIR set (the image sets it to a
# path under /tmp), the server and its build output are copied there first and every rewrite and the
# server itself run from the copy. The image is never written to, so it runs with a read-only root
# filesystem and a tmpfs on /tmp. node_modules is only read, so it is linked rather than copied.
# With it unset the rewrites happen in the current directory, which only works when the app
# directory is writable. The published image's /app is owned by root, so it needs
# BARAKO_RUNTIME_DIR.
runtime_dir="${BARAKO_RUNTIME_DIR:-}"
if [ -n "$runtime_dir" ]; then
  case "$runtime_dir" in
    /*) ;;
    *) echo "entrypoint: BARAKO_RUNTIME_DIR must be an absolute path. Got: $runtime_dir" >&2; exit 1 ;;
  esac
  app_dir=$(pwd -P)
  mkdir -p "$runtime_dir"
  # Both sides are resolved, so a trailing slash, a "." or ".." segment or a symlink cannot make the
  # app directory look like another path. The rm -rf below deletes inside the runtime directory, so
  # it must never be the app directory, a directory above it or one inside it.
  runtime_real=$(cd "$runtime_dir" && pwd -P)
  refuse=""
  if [ "$runtime_real" = "/" ]; then
    refuse="is the root directory"
  elif [ "$runtime_real" = "$app_dir" ]; then
    refuse="is the app directory"
  else
    case "$app_dir/" in
      "$runtime_real"/*) refuse="is a directory above the app directory" ;;
    esac
    case "$runtime_real/" in
      "$app_dir"/*) refuse="is inside the app directory" ;;
    esac
  fi
  if [ -n "$refuse" ]; then
    echo "entrypoint: BARAKO_RUNTIME_DIR $refuse, it would delete the app. Got: $runtime_dir (resolved to $runtime_real)" >&2
    exit 1
  fi
  runtime_dir="$runtime_real"
  for item in server.js package.json .next public; do
    rm -rf "${runtime_dir:?}/$item"
    if [ -e "$app_dir/$item" ]; then
      cp -R "$app_dir/$item" "$runtime_dir/$item"
      chmod -R u+w "$runtime_dir/$item"
    fi
  done
  if [ -e "$app_dir/node_modules" ]; then
    ln -sfn "$app_dir/node_modules" "$runtime_dir/node_modules"
  fi
  cd "$runtime_dir"
elif [ ! -w . ] || [ ! -w ./public ]; then
  echo "entrypoint: $(pwd) or its public directory is not writable, so the base path and the API address cannot be written into it. Set BARAKO_RUNTIME_DIR to a writable directory such as /tmp/barako-app." >&2
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

# The proxy's matcher is compiled into a regular expression that starts "^\\/<placeholder>(?:...". The
# backslash belongs to the slash, so rewriting the placeholder to nothing would leave "^\\(?:...", an
# invalid expression that fails every request. At the root, drop the escaped slash with the
# placeholder, in its JSON form (two backslashes in the file) and its JavaScript form (one). With a
# prefix the generic rewrite below leaves "\\/prefix", which is right.
if [ -z "$base_path" ]; then
  escaped_files=$(grep -rlF "\\$BASE_PATH_PLACEHOLDER" server.js .next 2>/dev/null || true)
  if [ -n "$escaped_files" ]; then
    printf '%s\n' "$escaped_files" | while IFS= read -r file; do
      sed -i.bak -e 's|\\\\'"$BASE_PATH_PLACEHOLDER"'||g' -e 's|\\'"$BASE_PATH_PLACEHOLDER"'||g' "$file" && rm -f "$file.bak"
    done
  fi
fi

placeholder_files=$(grep -rlF "$BASE_PATH_PLACEHOLDER" server.js .next 2>/dev/null || true)
if [ -n "$placeholder_files" ]; then
  printf '%s\n' "$placeholder_files" | while IFS= read -r file; do
    sed -i.bak "s|$BASE_PATH_PLACEHOLDER|$base_path|g" "$file" && rm -f "$file.bak"
  done
  echo "entrypoint: serving under ${base_path:-/}"
elif [ -n "$base_path" ]; then
  echo "entrypoint: BARAKO_BASE_PATH is set to $base_path but this image has no runtime base path to write it into. It was built with NEXT_BASE_PATH baked in." >&2
fi

# The Content-Security-Policy is built with a placeholder in connect-src (see src/lib/csp.ts and src/proxy.ts), because
# the API and press addresses are only known now. Each is reduced to its origin, so a path, a query or
# anything that is not an http(s) address cannot reach the header. Unusable or unset values leave
# nothing in its place, and the origin baked in at build time stays in the policy.
CONNECT_PLACEHOLDER="__BARAKO_CONNECT_ORIGINS__"
connect_origins=$(node -e '
const origins = [];
for (const name of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_PRESS_URL"]) {
  try {
    const u = new URL((process.env[name] || "").trim());
    if (u.protocol === "http:" || u.protocol === "https:") origins.push(u.origin);
  } catch (e) {}
}
process.stdout.write(origins.join(" "));
')
if printf '%s' "$connect_origins" | grep -Eq '^[A-Za-z0-9:/. _-]*$'; then
  csp_files=$(grep -rlF "$CONNECT_PLACEHOLDER" server.js .next 2>/dev/null || true)
  if [ -n "$csp_files" ]; then
    printf '%s\n' "$csp_files" | while IFS= read -r file; do
      sed -i.bak "s|$CONNECT_PLACEHOLDER|$connect_origins|g" "$file" && rm -f "$file.bak"
    done
  fi
else
  echo "entrypoint: ignoring NEXT_PUBLIC_API_URL and NEXT_PUBLIC_PRESS_URL for the Content-Security-Policy, an origin held an unexpected character" >&2
  csp_files=$(grep -rlF "$CONNECT_PLACEHOLDER" server.js .next 2>/dev/null || true)
  if [ -n "$csp_files" ]; then
    printf '%s\n' "$csp_files" | while IFS= read -r file; do
      sed -i.bak "s|$CONNECT_PLACEHOLDER||g" "$file" && rm -f "$file.bak"
    done
  fi
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
