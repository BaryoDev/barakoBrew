import type { NextConfig } from "next";

// Set NEXT_BASE_PATH at build time to serve the admin under a sub-path
// (e.g. "/barakocms" behind a shared reverse proxy). Leave it unset to serve
// from the domain root, which is what the published `latest` image does.
const basePath = process.env.NEXT_BASE_PATH || undefined;

const nextConfig: NextConfig = {
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
  env: { NEXT_PUBLIC_BASE_PATH: basePath ?? "" },
};

export default nextConfig;
