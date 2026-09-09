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

### Adding a dependency

Three rules, from [#39](https://github.com/BaryoDev/barakoBrew/issues/39). CI enforces the first
one. The other two need a person, so they are a checklist rather than a job.

**1. The licence must be permissive.** MPL-2.0 is file-level copyleft and §3.3 lets MPL files be
combined into a Larger Work under other terms, so the line is narrower than "MIT only".

Allowed: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, MPL-2.0, Unlicense, CC0-1.0, and the
permissive licences already in the tree that the audit in #39 missed because it read direct
dependencies only: 0BSD, MIT-0, BlueOak-1.0.0, Python-2.0, CC-BY-4.0.

Refused: GPL, AGPL, LGPL, SSPL, BUSL, Elastic, "fair source", and anything with no
machine-readable licence field. LGPL is refused despite its dynamic-linking allowance, because that
allowance is meaningless once a bundler inlines the code. AGPL is the one that would actually cost
money later: `CLA.md` names it as what enterprise buyers refuse, and the console is the part a
company deploys.

Two gates, because "what comes in" and "what goes out" are different questions and #39 only asked
the first. `scripts/check-licences.sh` reads the installed tree, and carries one named exception: the
`@img/sharp-libvips-*` prebuilt binaries are LGPL-3.0-or-later and arrive as an optional dependency
of Next.js itself, so `npm ci` installs them whatever this repository asks for. The script prints
that carve-out on every run. `scripts/check-image-licences.sh` reads the published image, which the
tree gate cannot speak for: the runtime stage copies Next's traced output rather than `node_modules`,
and output tracing pulled 27MB of libvips in behind a green tree gate
([#76](https://github.com/BaryoDev/barakoBrew/issues/76)). The image gate refuses copyleft outright,
with no exceptions, and CI proves it refuses by running it against a fixture holding the package that
shipped.

Keeping sharp out of the image is why the image optimiser is off and why `next.config.ts` excludes
`@img` from output tracing. `THIRD-PARTY-NOTICES.md` states the artifact's position and ships inside
the image, because a claim about what an image redistributes has to travel with it. Where image
resizing belongs when the redesign needs it is
[#80](https://github.com/BaryoDev/barakoBrew/issues/80).

**2. No runtime licence gates.** A permissive licence is not sufficient. The failure mode that
costs money is a package whose shipped code holds a licence key, phones home, or gates features at
runtime, because the bill arrives after you have built on it. Refuse it if any of these hold:

- [ ] your code must hold a licence key or token for it to work correctly
- [ ] the shipped bundle validates entitlement or contacts the vendor at runtime
- [ ] a feature you need exists only in a paid package, with the OSS one as a lead magnet
- [ ] unlicensed use degrades the product (watermark, console errors, nag)

`ag-grid-community` is the standing example and is banned. It is genuinely MIT, but enterprise
features ship in the same install gated by a key, and unlicensed use puts a watermark over your
grid and errors in the console. That was discovered in production, not in review.

A vendor selling something is not disqualifying, or this rule eats Next.js, React and TanStack.
What matters is whether the thing you ship can be switched off by someone else. Check the published
tarball, not the pricing page:

```bash
npm pack <pkg> && tar -xzf *.tgz
grep -rioE "licen[sc]e[- ]?key|validateLicense|entitlement|telemetry" package/dist
grep -rhoE "https?://[^\"' ]+" package/dist | sort -u    # outbound URLs
```

An inspection proves that *this version* is clean, not that the next one will be. The durable
protection is a permissive licence plus a committed lockfile plus the ability to fork.

**3. Maintenance is part of the check.** Abandonment strands you the same way a paywall does, and
no cheque fixes it.

- [ ] last publish is recent, and releases have a cadence
- [ ] open "is this still maintained?" issues have maintainer answers
- [ ] the docs and the code are in repositories that are not archived

`@dnd-kit/core` fails this today: its docs repo was archived in February 2026 and a direct
maintenance question ([dnd-kit#1830](https://github.com/clauderic/dnd-kit/issues/1830)) was closed
with no maintainer reply.

Put the answers to rules 2 and 3 in the PR body. A dependency nobody explained is one nobody can
review.

## Licence

barakoBrew is released under the [Mozilla Public License 2.0](LICENSE), and your contribution ships
under whatever licence the release carries. The [contributor terms](CLA.md) bound that to
OSI-approved licences, so a release containing your work is always open source.
