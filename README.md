# barakoBrew

The console for [barakoCMS](https://github.com/BaryoDev/barakoCMS). barakoCMS is the API, and the
only surface it ships with is Swagger. barakoBrew is where you design content types, roles,
workflows and integrations against that API. It is published as `ghcr.io/baryodev/barako-brew`.

**Live demo: <https://playground.baryo.dev/barakocms>**, sign in as `demo_admin` / `BarakoDemo2026!`

![Dashboard](assets/dashboard.png)

## Run it against an API

The image needs no build step. Point it at a running barakoCMS:

```bash
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://localhost:5005 \
  ghcr.io/baryodev/barako-brew:latest
```

Open <http://localhost:3000> and sign in with the initial admin account (`InitialAdmin__Username` /
`InitialAdmin__Password` on the API). The API has to allow the console's origin, so set
`CORS__AllowedOrigins=http://localhost:3000` on it.

No API yet? [`quickstart/`](quickstart/) composes Postgres, the API and the console from published
images.

`NEXT_PUBLIC_API_URL` is read at container start by `entrypoint.sh`, which writes
`public/env-config.js`. Repointing the console at another API never needs a rebuild.

`NEXT_PUBLIC_PRESS_URL` is optional: the address of the barakoPress site that renders the pages. With
it set, a page's `Blocks` field is edited as blocks built from the schema the site publishes at
`/api/blocks`; without it, that field stays a JSON editor. See [`docs/blocks.md`](docs/blocks.md).

Tags on `ghcr.io/baryodev/barako-brew`:

| Tag | Built from |
| --- | --- |
| `latest`, `<version>` | a `v*` tag, linux/amd64 and linux/arm64 |
| `dev`, `dev-<sha>` | every merge to master, both architectures |
| `playground`, `playground-<version>` | the release image plus playground.baryo.dev's configuration, both architectures |

Every tag is also pushed as `ghcr.io/baryodev/barako-admin`, the old name, at the same digest.
That name stops at 2.0.0.

### Serving under a sub-path

To host the console at something like `example.com/barakocms`, set `BARAKO_BASE_PATH` on the
published image. No rebuild, and the same image still serves the domain root when the variable is
unset:

```bash
docker run -e BARAKO_BASE_PATH=/barakocms -e NEXT_PUBLIC_API_URL=https://example.com/api \
  -p 3000:3000 ghcr.io/baryodev/barako-brew:latest
```

Then proxy `/barakocms/` to the container. Next.js 308-redirects `/barakocms/` to `/barakocms`, so
an nginx rule redirecting the other way will loop. Proxy the bare path instead of redirecting it.

The value is one or more `/segments` of letters, digits, dot, underscore, tilde or hyphen, with no
trailing slash. It ends up in JavaScript, JSON and HTML, so anything else is refused at start.

Next.js resolves `basePath` and `assetPrefix` during the build, which is why this cannot simply be
read from the environment at run time. The image is built against a placeholder prefix and
`entrypoint.sh` writes the real one into the build output before the server starts. The cost is a
second or so of startup; the gain is one published image for every site.

`--build-arg NEXT_BASE_PATH=/barakocms` still bakes a path in at build time for anyone who wants
that. An image built that way ignores `BARAKO_BASE_PATH`, and says so in its startup log.

## Which barakoCMS it works with

The console reads `X-Api-Contract-Version` from every API response and refuses to run against a
contract it does not speak, with a screen naming both sides. The contract is a number separate from
the barakoCMS version, and it moves only when the API's HTTP surface changes in a way that breaks a
consumer.

| barakoBrew | Contracts it speaks | barakoCMS releases it accepts |
| --- | --- | --- |
| 1.3.0, 1.4.0, 1.5.0 | 1 to 4 | 4.0.1 to 4.4.1 |
| 1.1.0, 1.2.0 | 1 to 3 | 4.0.1, 4.1.0 |
| 1.0.0 | 1 | 4.0.1 |

| barakoCMS | Contract it sends |
| --- | --- |
| 4.0.0, 4.0.1 | 1 |
| 4.1.0 | 3 |
| 4.2.0, 4.2.1, 4.3.0, 4.4.0, 4.4.1 | 4 |

No release sent contract 2: 4.1.0 moved from 1 to 3. barakoCMS 4.0.0 sends the header without
letting a browser read it, so a console served from another origin cannot see it and stops; use
4.0.1 or later. Accepting a contract does not mean every screen works on the oldest release that
sends it: limiting an API key to content types needs barakoCMS 4.4.0, and against an older API that
control stays hidden. `CHANGELOG.md` states the API range for each console release.

A console speaks both the old and the new contract across a move, so upgrade the console before the
API.

## Configuration

| Setting | Read | What it does |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | container start | Where the browser reaches the API. Default `http://localhost:5005`. |
| `NEXT_PUBLIC_PRESS_URL` | container start | The barakoPress site that renders the pages. With it set, a `Blocks` field is edited as blocks; without it, that field is a JSON editor. See [`docs/blocks.md`](docs/blocks.md). |
| `BARAKO_BASE_PATH` | container start | The sub-path the console is served under, such as `/barakocms`. Unset serves the domain root. See [Serving under a sub-path](#serving-under-a-sub-path). |
| `NEXT_BASE_PATH` | build (`--build-arg`) | Bakes a sub-path into the build. An image built with it ignores `BARAKO_BASE_PATH`. |
| `BARAKO_VERSION` | build (`--build-arg`) | The version the About dialog shows. Published images get their tag; a local build says `0.0.0-dev`. |

`entrypoint.sh` writes every `NEXT_PUBLIC_*` variable into `public/env-config.js`, which the browser
loads, so none of them may hold a secret.

## What it covers

The rail groups the screens as below. Each screen is shown only to the roles that can use it, and a
module's screen only when `GET /api/modules` reports that module running.

| Group | Screens |
| --- | --- |
| Main | Overview (stats, latest entries, health summary, command palette). Entries (create, edit, publish, archive, filter, version history with rollback). Content types (opening one opens its entries, fields are a second link; cards or list, search, sort). Pages (the page tree: drag or move pages, the navigation flag, slugs, redirects after a move). Workflows (trigger builder, conditions, actions the API registers, dry run). Queries (saved fetches a workflow can use) |
| Site | Site (tenant name, logo, header and footer links, site mode, holding page, share links). Theme (colour slots, fonts, radii, widths, tokens and tones, with a contrast check). Style recipes |
| Access | Tenants and their domains. Users. Roles with a per-content-type permission matrix. Groups and members. API keys, with scopes, optionally limited to content types |
| Modules | Accounting, Analytics, Email events, Feature flags, Files (uploads in the background, image preview and viewer), PWA installs |
| System | Audit log, Errors, Workflow runs, Health, Email, Security (two-factor), Devices, Export and import, Import a spreadsheet, Connectors, Outbound requests, Settings |

Sessions ride the API's rotating refresh tokens: the 15-minute access token renews automatically,
and a single in-flight refresh is shared across concurrent requests so the backend's replay
detection is never tripped. The access token lives in memory, not in local storage.

## Screenshots

| Entries | Entry editor and version history |
| --- | --- |
| ![Entries](assets/content.png) | ![Entry](assets/entry.png) |

| Workflows | Role permissions |
| --- | --- |
| ![Workflows](assets/workflows.png) | ![Roles](assets/roles.png) |

| Health | Per-field sensitivity |
| --- | --- |
| ![Health](assets/health.png) | ![Field sensitivity](assets/field-sensitivity-list.png) |

## Stack

- **Next.js 16** (App Router, React 19, standalone output)
- **shadcn/ui** on Tailwind CSS v4. Every colour flows through theme tokens in
  `src/app/globals.css`. The theme is Signal: indigo on a near-white page, Sora for display and
  Manrope for body, 14px panels. Light only, pinned in `src/app/layout.tsx`, because a Signal dark
  palette has not been drawn
- **Icons**: [Line Awesome by Icons8](https://icons8.com/line-awesome), vendored as inline-SVG
  React components in `src/components/icons/` (regenerate with `node scripts/gen-icons.mjs`)
- **TanStack Query** for data, **axios** with auth and refresh interceptors (`src/lib/api.ts`)
- **sonner** toasts, **next-themes**, and a command palette

## Local development

```bash
npm install
npm run dev        # http://localhost:3000, expects the API on http://localhost:5005
```

```bash
npm run lint       # eslint, with the jsx-a11y rules on
npx tsc --noEmit   # types
npm test           # vitest
npm run test:e2e   # playwright against a mocked API
npm run build      # production build
```

The mocked end-to-end pack in `e2e/` proves the console behaves given fixtures. It cannot prove the
fixtures match the server, so `smoke/` is the unmocked pack: `scripts/smoke-check.sh` stands up
Postgres and the published API image in Docker, seeds an administrator and an entry, builds the
console against them and runs `smoke/`. It contains no `page.route` and the script refuses to run
if one appears.

CI runs it against two API images, and which one went red says what changed. Pull requests and the
merge queue run the barakoCMS release pinned in `.github/barako-api-version`, so a red pull request
means the console changed. The nightly runs `ghcr.io/baryodev/barako-cms:master`, published on every
barakoCMS master push, so an API change surfaces here without anyone pushing; when it fails, CI
opens or comments on the issue "Nightly: console against barako-cms:master failed". Moving the pin
is a pull request that edits that file. Locally the script runs the pinned release; set
`BARAKO_API_TAG=master` to run what the nightly runs.

## Layout

```
src/
  app/(admin)/          # authenticated pages inside the sidebar shell
  app/login/            # sign-in
  components/ui/        # shadcn/ui primitives
  components/icons/     # generated Icons8 Line Awesome SVGs
  components/patterns/  # PageHeader, EmptyState, StatusBadge, ConfirmDialog, pagination
  hooks/                # TanStack Query hooks per feature area
  lib/api.ts            # axios client, token store, refresh rotation, pagination types
  types/                # API models mirroring the backend
packages/content-form/  # the content form as its own package, MIT
e2e/                    # Playwright, mocked API
smoke/                  # Playwright, real API
quickstart/             # docker compose for Postgres + API + console
```

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first; the coding standard is [AGENTS.md](AGENTS.md).
Opening a pull request means you agree to the [contributor terms](CLA.md). Licensed under
[MIT](LICENSE); releases up to 1.2.0 were MPL-2.0 and keep it.

If barakoCMS is useful to you, a star on the [API repository](https://github.com/BaryoDev/barakoCMS)
helps other people find it.
