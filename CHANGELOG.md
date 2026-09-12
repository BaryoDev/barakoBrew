# Changelog

Notable changes to barakoBrew, the operator console for [barakoCMS](https://github.com/BaryoDev/barakoCMS).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
[semantic](https://semver.org/spec/v2.0.0.html) and **independent of the API's**, because the two
release separately now and a shared number would force empty releases on whichever half had not
moved. Which API a console works against is stated per release instead.

## [Unreleased]

### Changed

- **The console speaks API contract 2 as well as contract 1, and has to ship with the barakoCMS
  release that moves to 2.** That release enforces slug uniqueness within a content type, so a
  create, an update, a rollback or an import row carrying a slug another entry already holds is
  refused with 400. Tightening request validation is a breaking change to the HTTP surface, so the
  API moves `X-Api-Contract-Version` to 2 (BaryoDev/barakoCMS#717). The console refuses to render at
  all against a contract version it does not speak, so a console pinned to 1 shows one page of
  explanation instead of the product the moment that API is deployed. Contract 1 stays supported:
  every released API sends it, and a rolling upgrade answers with both at once. Nothing else about
  the console changes, because contract 2's only behavioural difference is a refusal, and the entry
  form, the version rollback and the importer already render the server's own sentence when a write
  is refused.
- A pull request red only because its base is old now fixes itself. When master moves, any open
  pull request that is behind it and failing gets its branch updated and CI runs again. `minio/minio`
  being removed from Docker Hub failed the API repository's integration suite on every branch at
  once, and after the fix landed there two pull requests stayed red for a reason that was already
  fixed until somebody worked it out by hand. Nothing is merged and no job is retried: a retry hides
  a flake, where rebuilding on a newer base rules out one cause and leaves a real failure visible.
  Green-but-behind is left alone, and the `no-self-heal` label opts a branch out.

## [1.0.0] - 2026-09-09

**Works against barakoCMS 4.0.1 and later.** It cannot drive 3.21: 4.0 moved enums to strings, put
lists in an `items` envelope, returns ProblemDetails, answers 401 on a failed sign-in, and serves
content types at `/api/content-types`. It refuses 4.0.0 from a different origin to the API, which is
every ordinary deployment: the console reads the contract version from a response header, and 4.0.0
sends that header without exposing it to script, so the console cannot see it and stops rather than
half-working. 4.0.1 exposes it.

The first release of the console as its own product. The code is not new, it shipped inside the API
repository for a year, but nothing about how it was built, tested or published survived the split
until now. This release is the console becoming something that can be depended on: it has a version,
it says what it is licensed as, its tests run before it ships, and the image it publishes is built
from a commit anyone can point at.

### Added

- A CI suite that actually runs on `master`: lint, typecheck, 291 unit tests, Playwright with an axe
  pass, an image build, an SBOM, and an unmocked run of the console against a real API image.
- CodeQL, Dependabot for npm and Actions, issue and pull request templates.
- `LICENSE` (MPL-2.0), `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CLA.md` and `CONTRIBUTING.md`, with
  `AGENTS.md` as the coding standard both people and agents read.
- `quickstart/`, a compose file that brings up Postgres, the API and the console from published
  images with nothing to build.
- A gate that fails the build when an image in the repository carries provenance or identity
  metadata. The design screenshots each arrived with a 5,758 byte C2PA manifest naming the tool that
  made them, and every text-reading check was green over them.
- `docs/design/barakobrew-2026/`, the redesign handoff, its prototypes and an audit of every screen
  against the code as it stands.
- A gate that refuses to publish a tag serving only one architecture, and a CI job that proves the
  gate can fail. `barako-admin:3.21.0` is `linux/amd64` only, so `docker pull` of the version the
  documentation pins fails on Ampere, Graviton and Apple Silicon. The check reads the pushed
  manifest rather than the build config, because the config being right is not evidence the push
  was, and CI runs it against that known-bad tag on every pull request so its failure has been
  watched rather than assumed.
- The console refuses to start against an API whose contract version it does not speak, naming both
  numbers and which one to change. barakoCMS sends `X-Api-Contract-Version` on every response, 401s
  included, so the check needs no request of its own and covers the sign-in page too. A missing header
  counts as incompatible: it means an API old enough to predate the contract version entirely.
- A test that checks every enum this console mirrors against the server's own declaration, so a value
  added on one side cannot sit unnoticed on the other.
- Two licence gates. `scripts/check-licences.sh` reads the installed tree and fails on anything
  outside the permissive allow list, proven in CI against a scratch install of `ffmpeg-static`, which
  is GPL-3.0-or-later. `scripts/check-image-licences.sh` reads the published image, which is a
  different question: the runtime stage copies Next's traced output rather than `node_modules`, so the
  tree being clean is not evidence the image is. Rules that cannot be automated, no runtime licence
  gates and a maintenance check, are a checklist in `CONTRIBUTING.md` and a line in the pull request
  template.
- `CODEOWNERS`.

### Fixed

- The editor no longer loses an unsaved draft. A newer version of an entry arriving in the
  background (a refetch after `staleTime`, on window focus) replaced every field with the other
  person's values, with no error and no race involved. It now keeps what you typed and asks.
- Two editors no longer overwrite each other. The entry editor sends `If-Match` with the `ETag` it
  loaded, so a save against a version somebody else has already changed is refused and the editor
  says so, rather than the last writer winning in silence. It needs barakoCMS 4.0.1, which is the
  first release to let a browser read that header.
- The image ships no LGPL binary. Next's image optimiser wants `sharp`, whose prebuilt libvips
  binaries are LGPL-3.0-or-later, and it arrives as an optional dependency of Next itself, so 27MB of
  it was traced into the published image while the licence audit read direct dependencies and said
  there was no copyleft. The optimiser is off, because nothing here renders a remote image: the one
  `<img>` is an MFA QR code delivered as a data URL. Turning it off is not sufficient on its own, so
  `sharp` is excluded from output tracing as well, and a CI gate now reads the built image rather than
  the dependency tree, refusing copyleft and anything that does not say what it is licensed as.
  `THIRD-PARTY-NOTICES.md` states the artifact's position and ships at `/app/` inside the image, since
  a claim about what an image redistributes is worth little if it only exists in a repository nobody
  pulls. Where resizing belongs when the redesign needs it is an open spike.
- The field picker carries all 20 field types, grouped, and resolves the registry's aliases. It was
  three short, so three types the API accepts could not be chosen here.
- The five status states live in one module instead of being spelled out per screen, which is what let
  them drift apart.
- The default API URL is port 5005, the port the quickstart actually publishes. It was 5006, so the
  first thing a newcomer saw was a console that could not reach its API.
- Both configured Playwright projects run. They were declared and never selected, so a second browser
  was carried in the config and exercised nowhere.
- A refused save says so on the page rather than only in a toast that has gone in four seconds.
- `scripts/verify-runtime-config.sh` restores `public/env-config.js` when the verification fails.
  It moved the real file aside and exited before the restore, so a failing run left the working tree
  without its config. Fixed by [@kasapdev](https://github.com/kasapdev).
- Both scripts resolve paths from the repository root instead of one developer's home directory.
- ESLint no longer reads the vendored design prototypes, which is what turned the repository setup
  red and got it abandoned.

### Changed

- The npm package is `barakobrew`, not `admin`, and carries a real version. It is what appears in
  `npm audit`, the SBOM, and every CI log line.

[Unreleased]: https://github.com/BaryoDev/barakoBrew/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/BaryoDev/barakoBrew/releases/tag/v1.0.0
