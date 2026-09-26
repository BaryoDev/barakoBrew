# Review rules

Read by the adversarial-review skill (arnelirobles/lean-agent) before any code. Each rule is answered yes or no with a line. AGENTS.md is the coding standard; these are the questions reviews keep needing.

## Contract with barakoCMS

- **The accepted range lives in `src/lib/api-contract.ts`, `SUPPORTED_CONTRACT`.** An API outside it stops the console. Widening the range ships before the API release that needs it, and both ends stay live during a rolling upgrade.
- **A new screen works against an API without its endpoint.** A 404 from a module's route hides the screen or shows an empty state, never an error (D20: detected by presence).
- **Every save of an existing record sends `If-Match`,** and a 412 reloads and tells the user someone else changed it.
- **Paginated responses are read through the `Paginated<T>` envelope,** never as a bare array.

## Boundaries

- **The console owns no rules** (barakoCMS D20). Validation that decides what is allowed lives in the API; the console may flag early but must show the API's own message when it refuses.
- **No secret is shown twice, and none is left in a cache.** A key, setup secret or share link the API returns once renders through `RevealOnce` (`src/components/patterns/reveal-once.tsx`), and the mutation that returned it spreads `SECRET_MUTATION` from `src/lib/secrets.ts` and is reset once the value is in component state. A new secret screen that builds its own box, or a secret-returning mutation without those options, is a finding.
- **Anything configurable here is configurable through barista,** because both call the same API. A screen that needs a private endpoint is a finding.

## Tests

- A bug fix names the test that fails without it.
- A test that sets a query client's `retry: false` does not prove behaviour that depends on the hook's own retry setting.
- `scripts/preflight.sh` ran and its exit code was read.

## Style

- UI copy is plain and short. No em dashes or arrow glyphs, no banned words, and no attribution lines anywhere, review threads included.
