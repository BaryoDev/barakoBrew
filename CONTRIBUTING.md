# Contributing to barakoBrew

barakoBrew is the console for [barakoCMS](https://github.com/BaryoDev/barakoCMS). Bugs in the API
belong over there; anything you see in the browser belongs here.

## The coding standard

**The coding standard is [`AGENTS.md`](AGENTS.md)**, and `CLAUDE.md` includes it. Claude Code,
Cursor and the `AGENTS.md` tools each read a fixed filename automatically, so keeping the rules in
one file holds agents and people to one document rather than to copies that drift.

Read it before you write code. It covers the layout, the rules the console keeps towards the API,
the testing discipline and the comment policy. Most of what gets asked for in review here is already
written down in it.

## Contributor terms

There is nothing to sign. Opening a pull request means you agree to the
[contributor terms](CLA.md), which are short and in plain English.

The gist: you keep your copyright, we get permission to ship your work, and that permission is
limited to open source licences. barakoBrew cannot be taken proprietary, because nobody has been
asked for the rights that would allow it.

## AI agents

Contributions generated with AI agents are welcome. Point the agent at `AGENTS.md`, and say in the
PR that the code was AI-generated. It helps review.

## Talk to us

There is a [Discord server](https://discord.gg/7GYKzDx7Z2) for questions, ideas, and anything
easier to sort out in a conversation than in an issue thread. If you are weighing up whether
something is worth building, that is the fastest place to find out.

## These projects do not pay for work

Contributions here are voluntary and unpaid. There is no budget, no bounty programme, and no
commissioning of work on issues.

That is worth saying plainly rather than leaving people to find out. If you are looking for paid
work, this is not the place, and you should know that before you spend a weekend on something.

Offering to do an issue for a fee will get the comment labelled and left for a maintainer to read.
Nothing is blocked or deleted, and a genuine question about sponsorship is welcome, it just needs a
person rather than a bot to answer it.

## Before you file an issue

**Check it does not already exist, and say where you looked.**

An issue claiming something is missing should name the file or the search that showed it missing.
Four issues were filed on the API repository in one week for features that were already built. Each
would have been caught by a single grep.

So: `git grep` for the thing, and put what you searched for in the issue. If you find it half-built,
that is a better issue than the one you were going to write.

## Finding something to work on

Issues labelled [`good first issue`][gfi] and [`help wanted`][hw] are ones we would like help
with, and they carry enough context to start without asking.

**To claim one, comment `/take`.** A bot assigns it to you straight away. If it is already taken,
it tells you that instead of quietly adding you alongside someone else. Changed your mind? Say so
on the issue and we will unassign it.

**For anything large, a new screen, a new area of the console, or a refactor that touches many
files, open an issue first.** Not to gatekeep, but because the worst outcome is you spending a
weekend on something we then have to turn down.

[gfi]: https://github.com/BaryoDev/barakoBrew/issues?q=is%3Aopen+label%3A%22good+first+issue%22
[hw]: https://github.com/BaryoDev/barakoBrew/issues?q=is%3Aopen+label%3A%22help+wanted%22

## Code is not the only contribution

- **Accessibility.** The lint rules and the axe pass catch roughly half of WCAG. Keyboard order and
  focus through the dialogs need a person. A report from a screen reader is a real contribution.
- **Documentation.** READMEs, guides, corrections.
- **Bug reports** with steps to reproduce. A good report saves more time than most patches.
- **Translations**, once the console has the hooks for them.

Documentation contributions go through the same pull request process as code and skip the test
requirements below.

## Pull requests

1. Fork the repo and create your branch from `master`.
2. Name the branch `{type}/{issue}-{short-description}`, where type is one of
   `feature`, `bugfix`, `improvement`, `qa` or `chore`.
   Example: `bugfix/142-history-panel-reads-items`.
3. Add tests for anything you changed. See "Tests for a bug fix" below.
4. Run the gates locally: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`,
   `npx playwright test --project=chromium`. If you touched anything that talks to the API, run
   `bash scripts/smoke-check.sh` too (needs Docker).
5. Title the PR `Area: Description (closes #123)` and put `Fixes #123` on its own line in the
   body. GitHub only auto-closes from the body, so the title suffix is for readers.
6. Open it.

## Tests for a bug fix must fail before the fix

A test that passes both with and without your change proves nothing. Before opening the PR,
either:

- write the test first and watch it fail, or
- temporarily revert your production change and confirm the test goes red, then re-apply it.

The PR template asks which test fails without the change. That question is the point: it is what
separates a test that catches the bug from one that merely runs the code.

Watch for coincidental passes. Fixture data or an empty collection can make a broken path return
the right answer for your specific input. Choose inputs where the broken and fixed behaviour
differ visibly.

## Two traps worth naming

**A mocked test cannot prove the mock.** Every spec in `e2e/` mocks the API with `page.route`, so
it proves the console behaves given fixtures the same person wrote. It cannot prove those fixtures
match the server. A bug in how the console reads a response goes in `smoke/`, where nothing is
mocked, or it is not covered.

**An assertion over a collection must first assert the collection is not empty.**

```ts
expect(rows.every(r => r.status === 'Draft')).toBe(true);   // passes on [], proving nothing
```

Add the count first:

```ts
expect(rows).toHaveLength(3);
expect(rows.every(r => r.status === 'Draft')).toBe(true);
```

## Dependencies

- `package-lock.json` is committed and is the truth. CI and the Dockerfile run `npm ci`.
- A dependency bump is its own pull request. Dependabot opens grouped ones weekly.
- `npm audit` runs in CI and fails on Critical or High. If a finding has no fix, say so in the PR
  rather than lowering the gate.

## Licence

barakoBrew is released under the [Mozilla Public License 2.0](LICENSE), and your contribution ships
under whatever licence the release carries. The [contributor terms](CLA.md) bound that to
OSI-approved licences, so a release containing your work is always open source.
