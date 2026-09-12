<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# barakoBrew

The console for barakoCMS: a Next.js app that talks to the barakoCMS API over HTTP and nothing
else. Human-facing contribution rules live in `CONTRIBUTING.md`. This file is the coding standard,
and it is the working agreement for anyone (person or agent) changing code here. `CLAUDE.md`
includes it so both tools read one document.

## 1. Layout

```
src/app/(admin)/        authenticated pages inside the sidebar shell
src/app/login/          sign-in
src/components/ui/      shadcn/ui primitives
src/components/icons/   generated Icons8 Line Awesome SVGs, do not hand edit
src/components/patterns PageHeader, EmptyState, StatusBadge, ConfirmDialog, pagination
src/hooks/              TanStack Query hooks per feature area
src/lib/api.ts          axios client, token store, refresh rotation, pagination types
src/types/              API models mirroring the backend
e2e/                    Playwright, every route mocked with page.route
smoke/                  Playwright against a real API, no page.route, ever
scripts/smoke-check.sh  stands up Postgres and the API image and runs smoke/
quickstart/             docker compose for Postgres + API + console
```

## 2. Stack

- **Next.js 16** App Router, React 19, React Compiler on, standalone output
- **TanStack Query** for server state, **axios** in `src/lib/api.ts` for the client
- **shadcn/ui** on Tailwind CSS v4, colours only through the tokens in `src/app/globals.css`
- **vitest** with Testing Library for units, **Playwright** with axe for the browser

## 3. Rules

**The API is the contract.** `src/types/` mirrors what the server returns. When a shape changes on
the API side, change the type here and add an assertion to `smoke/` that would have caught it.
The bug this pack exists for: the History panel read `versions` from a response that returned
`items`, rendered an empty list, and every mocked spec stayed green because the mock returned
`versions` too.

**No `page.route` in `smoke/`.** `scripts/smoke-check.sh` greps for it and refuses to run. The
value of that pack is entirely that it does not mock.

**Hiding a control is not access control.** The API checks authorisation on every endpoint. The
console hides what a role cannot use so the screen makes sense, and nothing more.

**`NEXT_PUBLIC_*` is public.** Anything with that prefix ends up in the browser bundle or in
`public/env-config.js`. Never put a secret behind it.

**`package-lock.json` is the truth.** `npm ci` in CI and in the Dockerfile, never `npm install`.
A dependency bump is a pull request with the lockfile in it.

**A config default must preserve existing behaviour.** Adding a flag must not turn off something
that used to work. Default it to what happens today and let people opt in.

**Prefer an existing pattern over a new one.** If a neighbouring screen solves the same problem,
match it or say in the pull request why not. Check the pattern first: a pattern being existing is
not evidence it is correct, and if it looks wrong, say so rather than spreading it.

**Accessibility is a gate.** The jsx-a11y rules in `eslint.config.mjs` and the axe pass in
`e2e/accessibility.spec.ts` fail the build on serious and critical findings. Do not disable a rule
to get a screen through; fix the markup.

## 4. Testing

```bash
scripts/preflight.sh                             # every gate a laptop can run, in CI's order
scripts/preflight.sh --all                       # plus both Playwright packs

npm run lint                                     # eslint, jsx-a11y on
npx tsc --noEmit                                 # types
npx vitest run                                   # units
npx playwright test --project=chromium           # e2e, mocked API
bash scripts/smoke-check.sh                      # smoke, real API in Docker
```

**Run `scripts/preflight.sh` before pushing.** It runs lint, the typecheck, the unit suite with the
same discovered-test floor CI asserts, both Playwright packs' file discovery, the asset and licence
gates and the production build, reads each gate's own exit code, and ends by naming what it could
not check. CI's jobs are independent and its slowest takes twelve minutes, so without this the
cheapest way to find a mistake is to push and wait.

**Two test runners share this tree.** vitest collects `**/*.test.{ts,tsx}` repository-wide;
Playwright collects from `e2e/` and `smoke/`, and its default patterns include `*.test.ts` too. So a
unit test for a helper a Playwright pack shares goes in `src/test/`, not next to the specs, or
Playwright loads it and dies importing vitest before it runs anything. Both configs pin
`testMatch: '**/*.spec.ts'` and `src/test/runner-globs.test.ts` fails if either stops.

**The smoke pack needs Docker.** It pulls `ghcr.io/baryodev/barako-cms` and `postgres`. Set
`BARAKO_API_TAG` to test against a different API tag.

### Tests for a bug fix must fail before the fix

Either write the failing test first, or revert the production change and confirm the test goes red
before re-applying it. A test that passes both ways proves nothing.

Beware coincidental passes. Default ordering, fixture data, or an empty collection can make a
broken path produce the right answer for the input you happened to pick. Construct inputs where
broken and fixed behaviour differ visibly.

**An assertion over a collection must first assert the collection is not empty.**

```ts
expect(rows.every(r => r.status === 'Draft')).toBe(true);   // passes on [], proving nothing
```

```ts
expect(rows).toHaveLength(3);                                // now the next line has something to run on
expect(rows.every(r => r.status === 'Draft')).toBe(true);
```

### Naming

Test names read as sentences describing the behaviour: `a rejected login shows a message, not
[object Object]`. Keep that style; it makes a failure list readable.

## 5. Verification discipline

- **Run the gate that proved it.** After a change, rerun the suite that demonstrated the fix, not
  the cheapest one. A mocked spec returning a value the real API never returns is not a test.
- **Read the exit code, not the last line.** Piping through `tail` or `grep` returns *that*
  command's exit code, so a failed build can look like it succeeded.
- **Confirm which branch you are on** before drawing a conclusion from a search.
- **Before you claim something works, run it.** "Tests pass" means on the branch you are
  proposing, after your last change.
- **A pull request red only because its base is old fixes itself.** When master moves,
  `.github/workflows/refresh-stale-prs.yml` updates the branch of every open pull request that is
  behind it *and* failing, then lets CI run again. It never merges and never retries a job: a retry
  hides a flake, where rebuilding on a newer base rules out one cause and leaves a real failure
  visible. Green-but-behind is left alone. Label a pull request `no-self-heal` to pin it to its
  current base.

## 6. Comments

Default to no comment. Names and small functions carry the meaning. A comment earns its place when
it explains a non-obvious *why*, an invariant the types cannot express, or a deliberate edge case.

Linking a tracked issue to explain a surprising decision is welcome and stays useful after the
issue closes.

Do not leave provenance noise: no `// fix for X`, `// added for the Y flow`, `// see PR #123`.
That belongs in commit messages and rots in source.

## 7. Commits and pull requests

- Branch: `{type}/{issue}-{short-description}`, type one of
  `feature | bugfix | improvement | qa | chore`
- PR title: `Area: Description (closes #123)`
- PR body: `Fixes #123` on its own line, since GitHub only auto-closes from the body
- Commit messages: short and human, imperative subject. No AI attribution trailers, no
  `Co-Authored-By`.

## 8. Writing

Plain, direct, short, in every word that lands in this repository: code comments, commits, pull
requests, issues, docs. No em dashes; use commas, periods or parentheses. No marketing adjectives.
Concrete claims backed by tests or code.

## 9. Security

- Secrets never enter the repository. Treat a committed credential as an incident, since rotating
  is the only fix once it is pushed.
- Never log passwords, tokens or API keys. The access token lives in memory, deliberately, so a
  page reload drops it and the app refreshes; do not move it to local storage.
- Every request goes through `src/lib/api.ts`. Do not build a second client with its own token
  handling.
- Dependencies: `npm audit` runs in CI and fails on Critical or High.
