# Changelog

Notable changes to barakoBrew, the operator console for [barakoCMS](https://github.com/BaryoDev/barakoCMS).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
[semantic](https://semver.org/spec/v2.0.0.html) and **independent of the API's**, because the two
release separately now and a shared number would force empty releases on whichever half had not
moved. Which API a console works against is stated per release instead.

## [Unreleased]

## [1.0.0] - 2026-09-08

**Works against barakoCMS 4.0.0.** It cannot drive 3.21: 4.0 moved enums to strings, put lists in an
`items` envelope, returns ProblemDetails, answers 401 on a failed sign-in, and serves content types
at `/api/content-types`.

The first release of the console as its own product. The code is not new, it shipped inside the API
repository for a year, but nothing about how it was built, tested or published survived the split
until now. This release is the console becoming something that can be depended on: it has a version,
it says what it is licensed as, its tests run before it ships, and the image it publishes is built
from a commit anyone can point at.

### Added

- A CI suite that actually runs on `master`: lint, typecheck, 241 unit tests, Playwright with an axe
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

### Fixed

- The editor no longer loses an unsaved draft. A newer version of an entry arriving in the
  background (a refetch after `staleTime`, on window focus) replaced every field with the other
  person's values, with no error and no race involved. It now keeps what you typed and asks.
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
