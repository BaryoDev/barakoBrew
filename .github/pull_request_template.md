<!-- Title format: Area: Description (closes #123)
     e.g. "Auth: Reject expired OTP codes on the second attempt (closes #142)" -->

<!-- The coding standard is AGENTS.md (CLAUDE.md includes it). Most review comments here
     are already written down in it. -->

## What changed and why

<!-- What was wrong, and what this does about it. Link the issue. -->

Fixes #

## How to test

<!-- The steps a reviewer runs to see this working. -->

## Which test fails without this change

<!-- Name the test. For a bug fix, a test that passes both with and without the change proves
     nothing: either write it first and watch it fail, or revert the fix and confirm it goes red.
     For docs, build or dependency changes, write "not applicable". -->

## Checklist

- [ ] A test covers this, and I confirmed it fails without the change
- [ ] `npm run lint`, `npx tsc --noEmit` and `npx vitest run` are clean
- [ ] Anything that reads an API response has an assertion in `smoke/`, or the PR says why not
- [ ] Docs updated if behaviour or configuration changed
- [ ] No new dependency, or it clears all three rules in CONTRIBUTING.md ("Adding a dependency"):
      permissive licence, no runtime licence gate, still maintained. Say which above.

## Anything reviewers should know

<!-- Trade-offs, things deliberately left out, follow-up issues filed. Leave blank if nothing. -->
