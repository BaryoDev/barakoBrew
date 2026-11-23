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

// Next applies the base path to the matcher, so this reads the same at the root and under a prefix.
// Static assets (anything with a file extension, which covers env-config.js and the favicon) and
// _next/static and _next/image need no policy. Link prefetches are skipped as the Next guide shows.
export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|.*\\..*).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
