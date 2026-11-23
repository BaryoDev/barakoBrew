import { NextResponse, type NextRequest } from "next/server";
import { buildConsolePolicy, connectOriginsFromBuild, generateNonce } from "@/lib/csp";

// Header work only: a nonce and the policy that names it. The request carries both so Next puts the
// nonce on its own scripts and the layout can put it on the others. The response carries the policy
// for the browser.
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const policy = buildConsolePolicy({
    nonce,
    connectOrigins: connectOriginsFromBuild(),
    isDev: process.env.NODE_ENV !== "production",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

// Every path goes through the proxy except _next/static and _next/image, including public files and
// env-config.js: it is header work only. A path with a dot, such as /modules/Community.Thing, is a
// page and needs its policy. Link prefetches are not skipped, because a browser sends
// "Purpose: prefetch" for a <link rel=prefetch> to a real document and that document would then be
// stored without a policy. Next prepends the base path to this source, so it matches under a prefix
// the same way; the build writes the base path into the compiled matcher, which entrypoint.sh
// rewrites at start.
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
