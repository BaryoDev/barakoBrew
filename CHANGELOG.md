# Changelog

Notable changes to barakoBrew, the operator console for [barakoCMS](https://github.com/BaryoDev/barakoCMS).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions are
[semantic](https://semver.org/spec/v2.0.0.html) and **independent of the API's**, because the two
release separately now and a shared number would force empty releases on whichever half had not
moved. Which API a console works against is stated per release instead.

## [Unreleased]

### Added

- **Pages has a tree.** `/pages` shows the page tree from `GET /api/pages/tree`: drag a page, or use
  its move buttons, to reorder it or put it under another page, with the new path shown while
  dragging. Each move saves through the ordinary content update with `If-Match`, writing
  `NavigationOrder` and `ParentPage`. The API's refusal (a cycle, too deep, a reserved slug) is shown
  on the row, and a 412 reloads the tree and says someone else changed the page. Rows show status and
  path, switch the navigation flag, change the slug, add a page under a page, and open the entry.
  After a move or slug change that changes addresses, the screen offers a redirect from each old
  path. A 404 says the Pages module is not enabled, and a contract other than 1 lists the pages flat.
  Needs BaryoDev/barakoCMS#826. See `docs/pages.md`. (#91)
- **A page's blocks are edited as blocks.** A json field named `Blocks` gets a list built from the
  block schema the site publishes at `/api/blocks`: add from a palette, drag or use Move up and Move
  down to reorder, remove, and a form per block using the same controls as entry fields, with blocks
  nested in a `slots` field such as columns. What the site would refuse to render is marked on the
  row and the field. A block of a type the site does not list is shown read-only and saved as it was.
  Set `NEXT_PUBLIC_PRESS_URL` to turn it on; without it, or when the schema cannot be read, the field
  stays the JSON editor. See `docs/blocks.md`. (#90)

- **Choice fields.** The content type designer offers a Choice type: options with a value and a
  label, reordered by dragging or with the move buttons, and whether the field holds several values.
  Values that differ only in case are flagged before the API refuses them. In the entry editor a
  single choice is a radio group up to five options and a select beyond that, and a multiple choice
  is checkboxes. Clearing an optional choice leaves the value out of the save. A stored value the
  field no longer offers is marked "not offered any more" and the save waits until it is changed.
  A type's detail screen edits a choice field's options later through
  `PUT /api/content-types/{name}/fields/{field}/options`; when entries hold an option being removed,
  the API's message and entry count are shown with a Remove anyway button that resends with `force`.
  A saved query filters a choice by option; the entries list waits on BaryoDev/barakoCMS#825 for a
  field filter. Needs BaryoDev/barakoCMS#820; an API without the choice
  type refuses the content type and the page shows its message. (#136)

- **Site and Theme screens.** Site edits a tenant's name, tagline, address, locale, logo, footer logo,
  favicon, share image, top bar, header links, footer columns and social links; image fields can pick a
  public image from Files. Theme edits the colour slots and site colours, fonts, corner radii, widths,
  visitor variants and colours per option, with a preview of a header, card, dark band and prose block.
  Each text colour is measured against its background, and a pair below WCAG AA is flagged but never
  blocks the save. Both edit the one entry of the `site` type and send the whole stored document back,
  so neither wipes what the other saved. A tenant without the type is offered the site blueprint, which
  needs barakoCMS after 4.1.0 (BaryoDev/barakoCMS#797). A link the renderer would drop is flagged, and a
  stored value not in the documented shape is shown as JSON rather than trimmed to fit. (#134)
- **Tenants shows and edits each tenant's domains.** A domain another tenant holds is refused inline with
  the API's own sentence naming that tenant. The save sends the rest of the tenant back unchanged, since
  the endpoint overwrites every profile field. Needs BaryoDev/barakoCMS#796; an API that reports no
  domains shows that instead of an edit button. (#134)
- **Resolving an error asks for a reference and remarks.** Resolve on the Errors screen opens a dialog
  with an optional reference (a pull request or ticket link, or a number such as `AB#1234` or
  `PROJ-42`) and optional remarks. The error details show who resolved it, when, and both fields, with
  an http or https reference as a link. Needs BaryoDev/barakoCMS#790 to store them; an older API
  ignores the extra fields and resolves as before. (#130)

### Changed

- **barakoBrew is MIT.** `LICENSE`, the `license` field in `package.json` and the image's
  `org.opencontainers.image.licenses` label say MIT from this release. Releases up to and including
  1.2.0 keep MPL-2.0. The contributor terms in `CLA.md` now name barakoBrew rather than barakoCMS,
  state MIT, and grant a patent licence of their own, since MIT carries none. Follows the licence
  rule in BaryoDev/barakoCMS#815. (#135)

### Fixed

- **The PWA installs screen crashed on load** with `filter is not a function`. It read
  `GET /api/pwa/installs` as a bare list, but the API returns the paged envelope and has since
  barakoCMS 4.0.0. The screen now reads `items`, asks for the largest page the API serves (100), and
  takes the device count from `totalItems`, saying so when there are more devices than the table
  shows. (#128)

## [1.2.0] - 2026-09-14

**Works against barakoCMS 4.1.0, and speaks API contracts 1 to 3.** The grouped action picker below
needs a barakoCMS release that includes BaryoDev/barakoCMS#783, which reports a group for each
workflow action kind. That is merged and not yet released. On 4.1.0 the picker shows the flat list
it showed before, and nothing else depends on it.

### Added

- **Files shows a thumbnail for each image.** It is the API's 160px copy (`?w=160`), never the
  original, so a page of uploads costs kilobytes rather than megabytes. A public image loads from
  the anonymous route with a srcset; a private one is fetched with the session's token in a header
  and shown from a local object URL, so the token never appears in a URL. PDF, GIF and AVIF files,
  which the API does not resize, show an icon instead of downloading the original. The console
  still has no image optimiser and ships no image binary (#80).
- **A navigation menu is reordered without editing JSON.** The `Items` field of a `menu` entry is
  a list now: add and remove items, move them up and down, nest one under the item above and move it
  back out, all from the keyboard. The saved value keeps each item's keys and casing and changes only
  order and nesting, one level deep, which is what `public.menu()` in the client reads. A value the
  list cannot show without losing part of it stays in the JSON editor. The shape and the naming
  convention are in `docs/menus.md` (#86).
- **Files has a screen.** `/files` lists the tenant's uploads 20 at a time with name, type, size,
  visibility and upload date. Upload states the API's rules (PNG, JPEG, GIF, WebP, AVIF or PDF, up
  to 10 MB) and refuses a file that breaks them before sending it; a refusal from the server, such
  as the virus scanner's, is shown in the dialog. Delete asks first, and when entries still use the
  file it names them and deletes only on "Delete anyway". A public file has a copy link button.
  Delete is offered on a file to its uploader, Admin and SuperAdmin, which is who the API allows.
  An account the API refuses the list to is told so, with no upload control. The rail lists Files
  under Modules for Admin and SuperAdmin (#3).
- **A content type that holds one entry is edited on one screen, not a list.** barakoCMS 4.1.0
  marks such a type with `isSingleton` and refuses a second create. The console now lists each one
  in the rail under Entries and opens it at `/content/singleton/{type}`. With no entry yet, the first
  save creates it; after that the same screen edits it, with schedule and history. Links that used
  to open the list or the new entry form for such a type (the type's own page, `/content?type=`,
  `/content/new?type=`) land on that screen instead, and a type can be created with the flag on
  (#89).
- **A markdown field is a composer with a preview, not a bare textarea.** Write and Preview tabs,
  a toolbar for bold, italic, heading, link, list and code, and a word count. The preview renders
  with barakoPress's rules, so raw HTML shows as text and a link that is not http, https, mailto or
  relative keeps its words and loses its destination. The saved value is the text as typed; toggling
  the preview never writes to it. `text` and `richtext` fields are unchanged (#85).
- **A webhook workflow can be built from the new workflow form.** `Published` is offered as a
  trigger next to Created, Updated and the type's transitions. An action's optional parameters get
  inputs marked "(optional)", read from the example configuration the API publishes with each
  action, which is where the Webhook action names `Secret`. A parameter the API redacts on read
  (secret, token, password, API key and the like) is a password input with a hint that it will not
  be shown again, and a blank optional parameter is left out of the request rather than sent empty.
  The saved workflow says "Secret: set, not shown". The API never returns the value and has no
  update endpoint, so replacing a Secret means recreating the workflow. The trigger selects and the
  action picker have accessible names (part of #87).
- **The action picker groups kinds under Content, Delivery, Comms, Data and Flow.** The console no
  longer keeps its own list of action kinds: it shows what `GET /api/workflows/actions` returns,
  keeps the API's order inside a group, leaves out empty groups, and puts a missing or unknown group
  under Other, last. An API that sends no group, barakoCMS 4.1.0 included, gets the flat list with
  no headings. The Request action is drawn with the connector icon rather than the fallback (part
  of #50).

### Changed

- **The image is published as `ghcr.io/baryodev/barako-brew`.** It was the last place the old name
  survived. Every tag (`latest`, `<version>`, `dev`, `dev-<sha>`, `playground`,
  `playground-<version>`) is also pushed as `ghcr.io/baryodev/barako-admin` pointing at the same
  digest, and the publish job fails if the two names disagree. **`barako-admin` stops at 2.0.0**;
  move compose files and deploy scripts to `barako-brew` before then. Tags already pulled under the
  old name stay resolvable (#84).
- The unmocked pack runs against a pinned API image on pull requests, the merge queue and pushes
  (`barako-cms:4.1.0`, read from `.github/barako-api-version`), and against `barako-cms:master`
  nightly and on demand. A failed nightly opens or comments on one tracking issue.
  `scripts/smoke-check.sh` defaults to the same pin (#58).
- CodeQL runs on merge queue batches and on every pull request, markdown-only ones included, so it
  can be a required check (part of #26).
- Every third-party action in the workflows is pinned to a commit SHA, with its tag in a comment
  (#59).
- Every accessibility scan checks that reduced motion is on and waits for animations to settle
  before it audits the page (#92).
- CodeRabbit no longer reviews every pull request on its own, matching barakoCMS. Commenting
  `@coderabbitai full review` still asks for one (#60).

### Fixed

- **Import a spreadsheet sends the file.** The shared API client defaults to a JSON content type,
  and axios turned the upload form into JSON, so the analyze request reached the API with no file.
  The client now drops that default for any form body, so the browser sends multipart form data
  with its boundary. File uploads used to work around this on their own request and now rely on the
  same rule (#119).

## [1.1.0] - 2026-09-12

### Changed

- **The console speaks API contract 3, and has to ship with barakoCMS 4.1.0.** That release refuses
  a role named `SuperAdmin`, `Admin`, `HR` or `User` on create and on update, because a custom role
  taking one of those names inherited a full authorisation bypass and, through the role claim in the
  JWT, switched off field-level sensitivity masking as well (GHSA-2522-rpv2-6p99). Refusing a request
  the API used to accept tightens validation, so `X-Api-Contract-Version` moves to 3
  (BaryoDev/barakoCMS#740). Nothing else in the console changed: the refusal arrives as a 400 with a
  ProblemDetails reason, which `apiErrorMessage` already reads, the same path that surfaces the
  slug-uniqueness refusal below. Contracts 1 and 2 stay supported.

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

### Fixed

- A reference field is a search over the content type it points at, not a box for pasting a GUID
  into. The API has always sent `referenceType` naming that type, and the console's
  `FieldDefinition` dropped it on the way in, so Author, Category and every other relation could
  only be set by typing an id. Entries read as their titles now, the search runs on the server, and
  a definition that names no target type keeps the id box it had. Additive: no contract change, and
  the supported API range does not move. `smoke/reference-fields.spec.ts` holds the server to
  sending the field, since nothing mocked can.
- A reference that could not be read says which of the two things happened. "This id does not
  resolve to an entry" used to be the answer to every failure, including a timeout or a 500, which
  told an editor their data was broken when the connection was. A 404 keeps that sentence, anything
  else renders the server's own and offers a retry, and a failed entry list now says so instead of
  reporting that the target type holds no entries. Closing the picker returns focus to the field
  that opened it, on both exits, rather than dropping a keyboard user at the top of the form.
- The smoke pack refuses to send the seeded administrator's token over plain HTTP to anywhere but
  this machine. `SMOKE_API_URL` is an override four specs read, and it could name any origin, so an
  `http://` value pointing off-box put a working administrator credential on the wire in clear and
  the run passed. `smoke/api-url.ts` checks it once for all four: https anywhere, plain http to
  loopback only, and a failed run naming the reason otherwise.
- `scripts/preflight.sh` runs every gate a laptop can run, in the order CI runs them, and names the
  ones it could not. CI's jobs are independent and the unmocked pack takes twelve minutes to stand up
  a database and build the console, so a mistake the thirty second job could have caught was costing
  a push and a wait. The two Playwright configs now pin `testMatch` to `.spec.ts` and
  `src/test/runner-globs.test.ts` holds that line, because vitest collects `*.test.ts` everywhere and
  Playwright's default collects it too: a unit test written next to a pack's specs was loaded by
  Playwright, which died importing vitest before running one of them.

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

[Unreleased]: https://github.com/BaryoDev/barakoBrew/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/BaryoDev/barakoBrew/releases/tag/v1.2.0
[1.1.0]: https://github.com/BaryoDev/barakoBrew/releases/tag/v1.1.0
[1.0.0]: https://github.com/BaryoDev/barakoBrew/releases/tag/v1.0.0
