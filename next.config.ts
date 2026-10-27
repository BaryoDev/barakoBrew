import type { NextConfig } from "next";

// The sub-path the console is served under, e.g. "/barakocms" behind a shared reverse proxy.
// Next resolves basePath and assetPrefix during the build, so this stays a build input and cannot
// itself become a runtime one. The published image builds against the placeholder the Dockerfile
// passes and entrypoint.sh writes the real prefix into the output at container start, which is how
// one image serves the root and any prefix (#167). Unset means the domain root, which is what a
// local `npm run build` and both test packs get.
const basePath = process.env.NEXT_BASE_PATH || undefined;

// The origin of a URL, or null when it is not an http(s) address.
function originOf(value: string | undefined): string | null {
  try {
    const url = new URL((value ?? "").trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

// Where the browser may send requests, besides this origin. The API address is not known at build
// time in the published image: window._env_ (public/env-config.js) is written at container start from
// NEXT_PUBLIC_API_URL, the same variable getApiUrl() reads. So the image is built with a placeholder
// token in the policy, and entrypoint.sh swaps it for the origins of the runtime
// NEXT_PUBLIC_API_URL and NEXT_PUBLIC_PRESS_URL, the way it does for the base path. The build-time
// origin is listed too, so an image built with the API baked in and no runtime override still works.
// Outside the image there is no placeholder and the build-time values are the whole answer.
const connectPlaceholder = process.env.BARAKO_CONNECT_PLACEHOLDER || "";
const connectOrigins = [
  // The same fallback getApiUrl() uses.
  originOf(process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:5005",
  // The barakoPress site, read with a plain fetch for its block schema (use-block-schema.ts).
  originOf(process.env.NEXT_PUBLIC_PRESS_URL),
  connectPlaceholder,
].filter((value): value is string => Boolean(value));

const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  // Next writes inline bootstrap scripts (the flight payload, self.__next_f.push) and there is no
  // nonce setup, so 'unsafe-inline' is needed or no page hydrates. This weakens script-src: a CSP
  // here does not stop injected inline script. Moving to nonces needs a proxy that renders every
  // page dynamically. 'unsafe-eval' is development only, for React Refresh.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Tailwind is compiled to a stylesheet, but React style={{}} props and Radix write inline styles.
  "style-src 'self' 'unsafe-inline'",
  // data: for the MFA QR code and inline image fields, blob: for private files shown from object
  // URLs, http/https for the API's public files and for image URLs an editor types into the site
  // settings, which can be any host.
  "img-src 'self' data: blob: http: https:",
  // Fonts are vendored and served by next/font/local. data: covers inlined font files.
  "font-src 'self' data:",
  // The API (XHR and the workflow run stream, both fetch) and the press site. ws: is for the dev
  // server's hot reload socket.
  `connect-src 'self' ${connectOrigins.join(" ")}${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // frame-ancestors covers modern browsers, this covers the rest. The email preview iframe is a
  // child frame with srcDoc, which these do not affect.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
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
  env: { NEXT_PUBLIC_BASE_PATH: basePath ?? "" },
};

export default nextConfig;
