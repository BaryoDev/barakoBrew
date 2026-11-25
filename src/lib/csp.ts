// The console's Content-Security-Policy. src/proxy.ts builds it per request, because script-src
// carries a nonce that must differ on every response.

// The origin of a URL, or null when it is not an http(s) address.
export function originOf(value: string | undefined): string | null {
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
// token, and entrypoint.sh swaps it in the compiled output for the origins of the runtime
// NEXT_PUBLIC_API_URL and NEXT_PUBLIC_PRESS_URL, the way it does for the base path. The build-time
// origin is listed too, so an image built with the API baked in and no runtime override still works.
// Outside the image there is no placeholder and the build-time values are the whole answer.
//
// Each process.env name is written out in full on purpose: Next inlines them into the proxy bundle at
// build time only when it can see the whole expression. BARAKO_CONNECT_PLACEHOLDER is inlined through
// the env option in next.config.ts.
export function connectOriginsFromBuild(): string[] {
  // Set only when building the published image, where entrypoint.sh swaps it for the runtime origins.
  const placeholder = process.env.BARAKO_CONNECT_PLACEHOLDER || "";
  return [
    // The same fallback getApiUrl() uses. The published image leaves it to entrypoint.sh, which adds
    // it only when no API address is set at start, so a console that names its API does not also
    // allow http://localhost:5005.
    originOf(process.env.NEXT_PUBLIC_API_URL) ?? (placeholder ? null : "http://localhost:5005"),
    // The barakoPress site, read with a plain fetch for its block schema (use-block-schema.ts).
    originOf(process.env.NEXT_PUBLIC_PRESS_URL),
    placeholder,
    // The Modules Browse view asks NuGet's search service for packages tagged barakocms-module (#248).
    // One origin, fixed, and a failed call only shows "unavailable", so an offline deployment loses
    // nothing else.
    "https://azuresearch-usnc.nuget.org",
  ].filter((value): value is string => Boolean(value));
}

export type ConsolePolicyInput = {
  nonce: string;
  connectOrigins: string[];
  isDev: boolean;
};

export function buildConsolePolicy({ nonce, connectOrigins, isDev }: ConsolePolicyInput): string {
  return [
    "default-src 'self'",
    // Only a script that carries this request's nonce runs, and a script it loads in turn
    // ('strict-dynamic'). An injected inline script has no nonce, so it does not run. 'unsafe-eval' is
    // development only, for React Refresh.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
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
    `connect-src 'self' ${[...new Set(connectOrigins)].join(" ")}${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

// 16 random bytes from Web Crypto, base64, so it runs in the proxy and in tests alike.
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
