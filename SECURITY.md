# Security Policy

## Reporting a vulnerability

If you find a security problem in barakoBrew, report it privately:

1. **Do not open a public GitHub issue.**
2. Email arnelirobles@gmail.com.
3. Include a description, steps to reproduce, and the impact you see.

A problem in the API (authorisation, tokens, rate limits) belongs to
[barakoCMS](https://github.com/BaryoDev/barakoCMS/security/policy); the same address takes it.

## Response timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 1 week
- **Fix**: depends on severity

## Supported versions

The console is versioned by git tag and released as `ghcr.io/baryodev/barako-admin:<version>`. The
newest tag is supported. A fix ships as a new tag; there is no backport line for the console,
because upgrading it is pulling a new image and nothing else.

The API it talks to follows barakoCMS's own policy.

## What the console holds

- The access token lives in memory. A page reload drops it and the console refreshes through the
  API's rotating refresh cookie. It is never written to local storage.
- Everything prefixed `NEXT_PUBLIC_` is public: it is in the bundle or in `public/env-config.js`.
  The console has no server-side secrets and needs none.
- Authorisation is the API's job. The console hides controls a role cannot use, and nothing about
  that is a security boundary.

## When you deploy it

- Serve it over HTTPS. The API marks its refresh cookie `Secure` outside Development, so a console
  on plain HTTP against a Production API cannot keep a session.
- Set `CORS__AllowedOrigins` on the API to the console's origin, not `*`.
- Pin the image tag rather than running `latest`.

## Known advisories we accept

None. `npm audit` reports zero Critical or High findings, and CI fails the build on either.
