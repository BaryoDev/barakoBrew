import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// This console's own version, shown in the sidebar. The API reports its own, separately.
const brewVersion: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

// The sub-path the console is served under, e.g. "/barakocms" behind a shared reverse proxy.
// Next resolves basePath and assetPrefix during the build, so this stays a build input and cannot
// itself become a runtime one. The published image builds against the placeholder the Dockerfile
// passes and entrypoint.sh writes the real prefix into the output at container start, which is how
// one image serves the root and any prefix (#167). Unset means the domain root, which is what a
// local `npm run build` and both test packs get.
const basePath = process.env.NEXT_BASE_PATH || undefined;

// The Content-Security-Policy is built per request in src/proxy.ts, because script-src carries a
// nonce. It is not listed here: a page must send exactly one policy, and both would be enforced.
// The proxy's compiled bundle reads BARAKO_CONNECT_PLACEHOLDER through the env option below, which
// is how entrypoint.sh finds the placeholder to swap for the runtime API and press origins.
const connectPlaceholder = process.env.BARAKO_CONNECT_PLACEHOLDER || "";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // frame-ancestors covers modern browsers, this covers the rest. The email preview iframe is a
  // child frame with srcDoc, which these do not affect.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// HSTS tells the browser to use https for this host from then on, so it must never reach a plain
// http origin such as http://localhost, where it would break the next visit to any other http app on
// that name. The console does not terminate TLS itself, so "served over HTTPS" means a reverse proxy
// did and said so with X-Forwarded-Proto. A proxy that does not send it gets no HSTS and can add the
// header itself. A chain of proxies sends "https,https" or "https, https", so the value is matched
// as one or more https entries (Next anchors it, so the match is case sensitive and exact). No
// includeSubDomains and no preload: the console may share a domain with sites that are not ready
// for either.
const hstsHeader = { key: "Strict-Transport-Security", value: "max-age=31536000" };

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/:path*",
        has: [{ type: "header", key: "x-forwarded-proto", value: "https(?:,\\s*https)*" }],
        headers: [hstsHeader],
      },
    ];
  },
  output: "standalone",
  reactCompiler: true,
  // Next's image optimiser is the only thing that wants `sharp`, and sharp's prebuilt libvips
  // binaries are LGPL-3.0-or-later. Leaving the optimiser on traced 27MB of them into
  // `.next/standalone`, which is what the published image copies, so the image redistributed a
  // copyleft binary while the licence audit said there was none (#76).
  //
  // It stays off for good (#80): the console resizes nothing and ships no image binary. User media
  // is drawn from the API's own variants, `?w=` on the file routes, through `src/lib/image-variants.ts`.
  images: { unoptimized: true },
  // Turning the optimiser off is not enough on its own: `npm ci` still installs sharp, because it is
  // an optional dependency of Next itself, and output tracing still copied all 27MB of it into
  // `.next/standalone`, which is the only thing the runtime image takes from the builder. Proven by
  // building both ways and listing `.next/standalone/node_modules/@img`. Excluding it from the trace
  // is what actually keeps it out of the image, and `scripts/check-image-licences.sh` asserts that.
  //
  // `npm ci --omit=optional` would do it too and cannot be used: Tailwind's oxide binaries and
  // lightningcss are optional dependencies as well, and the CSS build needs them.
  outputFileTracingExcludes: {
    "*": ["node_modules/@img/**", "node_modules/sharp/**"],
  },
  // Next 16.1 began blocking cross-origin requests for dev-server resources. The end-to-end suite
  // drives http://127.0.0.1:3100 while the dev server treats localhost as its origin, so every
  // /_next/* chunk was refused: the app never hydrated, clicks did nothing, and 28 tests failed
  // looking like a routing regression. Development only — a production build serves its own assets
  // and ignores this.
  allowedDevOrigins: ["127.0.0.1"],
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  // basePath is applied by the router and Link only. Code that sets window.location itself needs the
  // prefix too, and this inlines it into the client bundle. Not a secret: it is in every URL.
  env: { BARAKO_CONNECT_PLACEHOLDER: connectPlaceholder, NEXT_PUBLIC_BASE_PATH: basePath ?? "", NEXT_PUBLIC_BREW_VERSION: brewVersion },
};

export default nextConfig;
