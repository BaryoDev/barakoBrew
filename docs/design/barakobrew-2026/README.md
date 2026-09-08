# Handoff: barakoBrew admin redesign

## Overview

**barakoBrew** is the operator console for barakoCMS. It ships as its own product a few weeks after
CMS 4.0 — own repository (`BaryoDev/barakoBrew`), same container image
(`ghcr.io/baryodev/barako-admin`). This bundle is the v1 design: **eight screens** plus the design
philosophy and resource index that governs everything not drawn.

The brief the user set: fix an admin they described as "dull and boring and not intuitive", surface
capabilities the codebase already has but hides, and make it read as a developer tool rather than a
CRUD skin.

Source of truth for behaviour and data shapes: `BaryoDev/barakoCMS` @ `master` (see `github.md` for
the last sync and the screen-to-file map).

## About the design files

The files here are **design references written in HTML**. They are prototypes of the intended look
and behaviour, not production code to lift.

The target is the existing `admin/` app — Next.js 15 App Router, React, Tailwind v4, shadcn/ui,
TanStack Query. **Recreate these designs there using that app's own patterns.** Do not port the
inline styles; they exist because the prototype had to be a single file. Every screen maps to a
route that already exists, and every primitive below (Button, Card, Table, Badge, Select, Switch,
Tabs, Sidebar, Command) is already vendored in `admin/src/components/ui/`.

`.dc.html` files open directly in a browser. They need `support.js` and `icon-sprite.js` beside them
— both included. Serve the folder over a local static server rather than `file://` so the sprite
loads.

## Fidelity

**High fidelity.** Colours, type, spacing, radii, shadows and copy are final; match them. Where this
document gives a number, that number is the spec. Where it does not, measure the design file — it is
the source of truth for anything not written here, especially body copy inside panels.

One rule above the pixels: **if a value here contradicts the repository, the repository wins** and
you should flag it rather than quietly changing copy. Several strings on these screens (the field
type list, the workflow action registry, the lockout policy, the tenant-switch warning) are
statements about how the system actually behaves.

---

## What changes, at a glance

The current admin is Bootswatch Yeti: `--radius: 0rem`, primary `#007da6`, Open Sans with 300-weight
headings, `#dee2e6` borders, a flat 19-item sidebar. It is defined in `admin/src/app/globals.css`.

| | Current | barakoBrew |
| --- | --- | --- |
| Radius | `0rem` | 14px panels, 10–11px controls, 999px pills |
| Primary | `#007da6` teal-blue | `#5A46D6` indigo |
| Heading font | Open Sans 300 | Sora 600 |
| Body font | Open Sans | Manrope |
| Mono | Geist Mono | JetBrains Mono |
| Surface | `#ffffff` on `#f8f9fa` | `#FFFFFF` panel floating on `#FAFAFC` page |
| Border | `#dee2e6` | `#E7E8F1` hairlines |
| Elevation | `shadow-sm` everywhere | hairlines for structure, one popover shadow |
| Sidebar | 19 flat items, 256px | grouped with counts, badges and connector health, 248px rail |

Light theme only. Dark mode was deferred by the user; the token set inverts cleanly but has not been
drawn.

---

## Design tokens

Author these as CSS variables in `admin/src/app/globals.css`, replacing the Yeti block. Names map
onto the shadcn tokens the codebase already uses.

### Colour

| Token | Hex | shadcn mapping | Use |
| --- | --- | --- | --- |
| page | `#FAFAFC` | `--background` | app background behind panels |
| panel | `#FFFFFF` | `--card`, `--popover` | panels, cards, popovers |
| sunken | `#F2F3F9` | `--muted`, `--secondary` | segmented tracks, neutral chips, table head |
| line | `#E7E8F1` | `--border`, `--input` | every 1px border |
| line soft | `#F2F3F9` | — | interior row dividers inside a bordered list |
| ink | `#101223` | `--foreground` | primary text, dark code panels |
| ink-2 | `#4A4E66` | `--secondary-foreground` | body copy |
| muted | `#63687D` | `--muted-foreground` | labels, metadata, captions |
| faint | `#6E7387` | — | type hints, column heads, footnotes |
| disabled | `#C3C6D6` | — | decorative icons, disabled controls |
| accent | `#5A46D6` | `--primary`, `--ring` | primary buttons, active nav, links |
| accent hover | `#4A38C0` | — | primary button hover |
| accent ink | `#4034A8` | — | accent text and icons on lavender |
| accent deep | `#241C6B` | — | headings on lavender |
| accent soft | `#EEEBFD` | `--accent` | tinted panels, active nav, Scheduled |
| accent border | `#DED8FB` | — | border on anything lavender, card hover border |
| accent light | `#C9C1F5` | — | previous-period line, proportion bars |
| success | `#0B7A6B` on `#E6F7F4` | `--success` | Published, Posted, Healthy |
| affirmative | `#1C6B45` on `#DFF3E8` | — | Done / resolved rows |
| warning | `#8A5A10` on `#FDF2E3` | `--warning` | bounces, mocked connectors, In review |
| danger | `#A22C2C` on `#FDECEC` | `--destructive` | Unbalanced, errors, failed runs |

`muted` at `#63687D` is 5.44:1 on white and 4.91:1 on the `#F2F3F9` / `#FAFAFC` tints. **Do not
lighten it.** `globals.css` documents two prior WCAG remediations and the project gates on an axe
pass; an earlier draft used `#8B8FA6` (3.19:1) and failed.

### Typography

```
--font-display: 'Sora',           ui-sans-serif, system-ui, sans-serif;  /* 600 */
--font-sans:    'Manrope',        ui-sans-serif, system-ui, sans-serif;  /* 400 500 600 700 800 */
--font-mono:    'JetBrains Mono', ui-monospace, monospace;               /* 400 500 700 */
```

Self-host with `next/font/google` as the site already does — no runtime request leaves the box.

| Role | Family | Size | Weight | Tracking |
| --- | --- | --- | --- | --- |
| Screen h2 | Sora | 21–26px | 600 | -0.03em |
| Page title | Sora | 18–19px | 600 | -0.025em |
| Panel head | Sora | 14.5–15px | 600 | normal |
| Row text | Manrope | 13.5px | 700 | normal |
| Body | Manrope | 12.5–14px / 1.55–1.7 | 400–600 | normal |
| Field label | Manrope | 12–12.5px | 700 | normal |
| Group label | Manrope | 10.5px uppercase | 800 | 0.12em |
| Eyebrow | JetBrains Mono | 10–11px uppercase | 400–700 | 0.14em |
| Metric | JetBrains Mono | 30px / 1 | 700 | -0.035em, `tabular-nums` |
| Meta / code | JetBrains Mono | 10.5–12.5px | 400–700 | normal |

**Rule: every machine-produced value is monospace with `tabular-nums`.** Counts, versions, slugs,
timestamps, durations, IDs, latencies, event names, API paths, template variables. Human prose is
Manrope. This single rule does most of the work of making the admin feel like a developer tool.

### Spacing, radius, elevation

```
radius:  panel 14px · control 10–11px · chip 8–9px · pill 999px
padding: panel 16–18px · panel header 15px 18px · main 24px · table cell 13px 24px
gap:     grid 12px · stack 14–20px · inline 8–12px
shadow:  card       0 1px 2px  rgba(16,18,35,.04)
         raised     0 1px 3px  rgba(16,18,35,.06)
         popover    0 16px 40px rgba(16,18,35,.16)
         palette    0 34px 80px -22px rgba(16,18,35,.55)
         accent btn 0 5px 14px -7px rgba(90,70,214,.8)
control heights: 44px form field · 38–40px default · 36px compact · 34px small · 30–32px inline
row height: 44px minimum, tables and lists alike
```

### Status vocabulary

Five states, fixed pairs, identical in tables, editor headers, workflow nodes and the "Needs you"
list. A sixth state requires a decision entry.

| State | Ink on ground | Meaning |
| --- | --- | --- |
| Draft | `#4A4E66` on `#F2F3F9` | unpublished, no version yet |
| In review | `#8A5A10` on `#FDF2E3` | assigned to a reviewer; blocks publish |
| Scheduled | `#4034A8` on `#EEEBFD` | has a future publish time |
| Published | `#0B7A6B` on `#E6F7F4` | live version exists; edits create a new draft |
| Archived | `#63687D` on `#F2F3F9` | hidden from the API, history retained |

Domain states borrow the same pairs rather than inventing colours: `Posted` uses Published, `Private`
uses Scheduled with a lock glyph, `Unbalanced` uses danger.

---

## Screens

File: `barakoBrew - Admin design.dc.html`. Screenshots are indexed at the end.

### 1. Sign in — `admin/src/app/login/page.tsx`

448×700 frame. Centered column on `#FAFAFC`, bean at 300px / 7% opacity bleeding off the bottom-left.
44px bean above a Sora 24/600 heading **"Sign in to barakoBrew"** ("Brew" in `#5A46D6`) and the
workspace name. Form is a white 16px-radius card: username, password with a reveal toggle and a
"Forgot?" link, 44px accent submit. Below an `OR` divider, two outline buttons — "Email me a sign-in
code" and "Continue with GitHub" — both already backed by `DeviceTrust` and `ExternalAuth`. The
footnote states the real policy: five failed attempts locks for 15 minutes; a new device asks for an
emailed code.

### 2. Overview — `admin/src/app/(admin)/page.tsx`

1440×900. The shell every admin screen shares, and the only fully interactive screen in the file.

**Sidebar, 248px, on the page background, 16px padding.** Bean 30px + "barakoBrew" + version in mono.
A 40px search button with a `⌘K` kbd. A tenant switcher showing the tenant initial in an accent tile,
its name, and "3 tenants available".

Nav is **grouped, not flat** — the main fix for "not intuitive":

- Primary (Overview, Entries, Content types, Workflows) at 38px, mono counts right-aligned.
- `Access` — Users and roles, Groups, Tenants, API keys.
- `Modules, 5 installed` — the installed set, unread counts as tinted pills, plus an accent
  "Add a module" row.
- `Connectors` with a `5 live / 1 mocked` line and a 7px health dot per row (Resend, SMTP relay,
  GitHub OAuth, Google OAuth, Umami, Ollama, S3, outbound webhooks), each `title`-attributed to the
  module that provides it, plus an accent "Connect something" row.
- `System` — Audit log, Errors (danger badge), Health, Security, Settings.

Active item is a white card with `0 1px 2px rgba(16,18,35,.06)` and an accent icon. Footer is the
account card with the role **in the current tenant**.

**Content panel.** White, 14px radius, `margin: 16px 16px 16px 0` so the sidebar reads as a rail.
60px header: page title, tenant slug in mono, live `p95 · err` line, Healthy pill with a pulsing dot,
a bolt button with an unread dot, primary "New entry".

**Body.** A greeting that states the day's actual situation and counts what is waiting. An
accent-tinted banner for scheduled publishing. Four stat cards with mono metrics — Entries,
Published (three-segment proportion bar), Delivery API, Visitors with a sparkline. Then a 1.55/1
split: **"Needs you"** (things requiring a decision — this replaces the old "Latest entries", which
required none) and, in the rail, **Event stream** and **System**.

Interactions to reproduce: ⌘K command palette (12 seeded commands, filtered, with an empty state);
tenant switcher popover that re-issues the token and toasts; 7/30/90-day range toggle that tweens
every metric over 620ms with an ease-out cubic; "Needs you" rows that resolve and un-resolve, with a
Reset link and an undo toast; a live event stream that appends every 4.2s and can be paused.

### 3. Entries — `admin/src/app/(admin)/content/page.tsx`

960×700. Header with a live count pill. Filter bar: 280px search, status segmented control
(All / Published / Draft / Scheduled / Archived), type dropdown. Table: `#FAFAFC` head with
10.5px/800 uppercase labels, 13px rows, title 700, type in mono, status pill, version and relative
time right-aligned in mono. Row hover `#FAFAFC`. Footer: "1 to 20 of 148" with prev and next.
Non-deliverable types show a lock glyph and `Private`.

### 4. Entry editor — `admin/src/app/(admin)/content/[id]/page.tsx`

1000×760. Header: back button, title, status pill, a `Saved` confirmation pill, and a mono meta line
reading `article · v7 · publishes today 09:00 · /api/public/article/spring-roast`. Actions: Preview,
Archive, Publish now.

Two-pane split. Left is the form under a pill tab group — **Content / Scheduling / Permissions /
History**. Promoting Scheduling and Permissions out of the field list is deliberate; they were
buried. Every field carries a mono type hint (`string · required`, `slug · required`, `markdown`,
`reference`, `datetime`). The body field is a bordered composer with a toolbar and a live word count.
`Publish at` renders as an accent-tinted control when a schedule is armed. A public-delivery toggle
closes the pane.

Right pane, 290px on `#FAFAFC`: the **event stream** as version cards — current one accent-bordered,
older ones stepped down in opacity, each with "Restore this version" — then **Workflows watching**,
naming the automations that will fire on publish.

### 5. Content type builder — `admin/src/app/(admin)/schemas/new/page.tsx`

760×760. Display name and API name side by side, the API name auto-derived and marked `auto`. A
public-delivery toggle whose description shows the live route it would expose. The field list is
draggable rows: type icon in an accent tile, display name, `apiName · type` in mono, a `Required`
pill. **One field is shown expanded mid-edit** — type, sensitivity, required — because per-field
sensitivity is the most valuable buried feature; the note explains that masked fields never leave the
API in cleartext, including in version history.

Below, a dashed "Add a field" panel carrying **all 20 field types**, grouped: Text (`string`, `text`,
`richtext`, `markdown`, `slug`, `uuid`), Numbers (`int`, `decimal`, `money`), Time (`date`,
`datetime`, `time`), True or false (`bool`), Structured (`array`, `object`, `json`, `geopoint`),
Checked on write (`email`, `url`, `reference`). The footnote states the invariant: `FieldTypeRegistry.cs`
is the single place the set is defined, `integer`/`number` alias `int` and `boolean` aliases `bool`,
each type carries an editor hint that picks the control, and adding a type is one registry entry —
not a change in the UI.

> This screen answers Arnel's review question directly. The earlier draft showed eight types; the
> registry has twenty.

### 6. Workflows — `admin/src/app/(admin)/workflows/page.tsx`, `workflows/new/page.tsx`

1280×840. Two panes.

Left, 336px: filterable list. Each card shows name, enable toggle, `triggerContentType · triggerEvent`
in mono, action-type chips and a run-health line (green clean, danger on failure). Paused workflows
drop to 0.72 opacity.

Right: a builder on a vertical timeline with three nodes — **When** (accent node), **Only when**,
**Then do**. When is a sentence: "an entry of type [Article] is [Created | Updated]". Only when is a
list of `field equals value` rows plus a dashed "Add condition". Then do is an ordered action list;
action 1 (Email) and action 3 (HttpRequest) are expanded.

The **HttpRequest** action is the argument of the screen: method segmented control, templated URL,
header rows, a JSON body template on an ink panel, and a four-up summary of `auth`, `timeout`,
`retry`, `on failure`, then `run if` and an `idempotency key`. Anything with an HTTP API is
configuration, not a code change.

Below it, the **action library — 22 kinds, read from `GET /api/workflows/actions`** and grouped:

- **Content** — CreateContent, UpdateField, ChangeStatus, Schedule, CreateTask
- **Delivery** — HttpRequest, Webhook, PurgeCache, RebuildFeed
- **Comms** — Email, SMS, Notify
- **Data** — PostJournalEntry, SetFeatureFlag, EnqueueImport, WriteAudit
- **Flow** — Conditional, Delay, ForEach, CallWorkflow, EmitEvent, Stop

The closing note is load-bearing: every action is a row of JSON in the definition, rendered from the
registry the API reports, so a new automation needs no deploy. A new action *kind* is the one thing
that is code — a class implementing `IWorkflowAction` in a module, discovered on restart, appearing
here with its own fields. Core is never edited for either.

Then the template-variable palette scoped to the trigger type, and a "Last runs" log with dry runs
marked.

> **Implementation note.** Rendering literal `{{variable}}` inside a Design Component required
> escaping, because `{{ }}` is the prototype's own template syntax. That constraint does not exist in
> React — render the strings directly.

### 7. Analytics — `admin/src/app/(admin)/analytics/page.tsx`

1280 wide. Header: website picker with a status dot, an "active now" pill, and a 24h/7d/30d/90d
segmented control. Four summary cards with mono metrics and a change line against the previous
period, coloured by direction. "Pageviews over time" draws the current period as a filled accent line
and the previous period as a dashed `#C9C1F5` line behind it. Then six breakdown cards, 3-up twice —
Top pages, Referrers, Countries, Devices, Operating systems, Browsers — each row a proportional
10%-tint bar behind the label with a right-aligned mono count.

**Marks in the breakdown rows** (this was a review item):

- Devices use sprite glyphs — `ic-desktop`, `ic-tablet`, `ic-mobile`.
- OS, browser and referrer rows use an **18px monogram chip in that vendor's own colour**, not the
  vendor's logo.
- The footnote states the rule: the 18px slot takes a locally vendored CC0 icon set (simple-icons is
  the intended source) with the monogram as the fallback, and **referrer favicons must be fetched and
  cached API-side**, never pulled by the browser from a favicon service — that would hand every
  domain in the list to a third party, which is the same reason the Umami proxy exists.

### 8. Tenant switcher, open

900×640. A 300px popover 6px below the trigger, `0 16px 40px rgba(16,18,35,.16)`. Eyebrow, the
user's tenants each with `slug · role` in mono and a check on the current one, then the footer line:
*"Switching re-issues your token for that tenant. Your role can differ per tenant."* That is the
behaviour in `hooks/use-tenants.ts` — the switch calls `/api/me/switch` and invalidates every query.
The screen behind it dims to 0.4 to show the scope of the change.

### 9. Philosophy and resources

Not a product screen — the rules that govern screens nobody has drawn yet. Six principles, the layout
shell token table, typography at density, the status vocabulary, and nine resource cards pointing at
the files to touch in order. **Read this before building screen ten.**

---

## Interactions and behaviour

- **Hover.** Nav items to `#F2F3F9`. Cards to `border-color: #DED8FB` with
  `0 10px 26px -14px rgba(90,70,214,.28)` and a 2px lift. Table rows to `#FAFAFC`. Accent buttons to
  `#4A38C0`. Outline buttons to `border-color: #5A46D6; color: #4034A8`. 120–180ms.
- **Live indicators.** Health dots and event-stream dots pulse `opacity: 1 → .3` over 1.8–2.4s.
  Disable under `prefers-reduced-motion` — note the existing comment in `globals.css`: Radix needs
  near-zero durations rather than `none`, or dialogs never unmount.
- **Segmented controls.** Track `#F2F3F9`, 3px padding, active thumb white with
  `0 1px 2px rgba(16,18,35,.08)`.
- **Toggles.** 32–38px wide, accent when on, `#E7E8F1` with a shadowed white thumb when off.
- **Command menu.** `⌘K` / `Ctrl-K`, `esc` to close — already implemented in
  `components/command-menu.tsx`.
- **Toasts.** Ink pill, bottom centre, 3.6s, with Undo where the action is reversible.
- **Focus.** Keep the shadcn 3px `ring-ring/50` treatment with `--ring: #5A46D6`.

## State management

No new patterns. Everything maps to existing TanStack Query hooks in `admin/src/hooks/`:
`use-schemas`, `use-contents`, `use-workflows`, `use-analytics`, `use-monitoring`, `use-tenants`,
`use-meta`. The Overview's "Needs you" list is a derived view — scheduled entries, drafts past an
age, module-reported problems — not a new endpoint. Connector health comes from `/api/meta/modules`
plus each module's own health report.

## Assets

- **Bean logo.** Geometry from `site/app/bean.tsx`, unchanged: `viewBox="0 0 128 128"`,
  `rotate(-32 64 64)`, `ellipse rx=33 ry=50`, highlight `ellipse cx=52 cy=44 rx=9 ry=17` at 0.35,
  crease `path d="M64 17 C 51 41, 77 55, 64 64 C 51 73, 77 87, 64 111"` stroked 6.5 round. **Only the
  fill changed**: `#9C8DF5 → #5A46D6 (0.55) → #33257F`, crease `#241C6B`. Used at 30px in the sidebar
  and 44px on sign in; never below 20px.
- **Icons.** The repo's own vendored Line Awesome set from `admin/src/components/icons/index.tsx`,
  extracted into `icon-sprite.js` (`viewBox="0 0 32 32"`, `fill: currentColor`, ids like
  `#ic-content`), plus two symbols defined inline in the design file for the Devices rows:
  `ic-desktop` and `ic-tablet`. **In the real app, keep importing the existing React icon components**
  — the sprite exists only so the prototype could use the real glyphs. Nothing was hand-drawn.
- **Vendor marks.** None shipped. See the Analytics note above.
- **Fonts.** Sora, Manrope, JetBrains Mono — all on Google Fonts.
- **Imagery.** None.

## Files in this bundle

```
barakoBrew - Admin design.dc.html                 the deliverable — eight screens + philosophy
Proposed - barakoBrew gaps and modules.dc.html    four proposal screens + candidate-primitives table
Current State - barakoCMS.dc.html                 the existing UI, rebuilt from source, for before/after
Redesign Directions - barakoCMS.dc.html           the three explored directions; 1c "Signal" was chosen
icon-sprite.js                                    Line Awesome symbols from the repo
support.js                                        runtime the .dc.html files need
github.md                                         repo association, last sync, screen-to-source map
README.md                                         this file
screenshots/                                      1x PNG of every screen
```

### Screenshot index

| File | Screen |
| --- | --- |
| `01-admin-sign-in.png` | Sign in |
| `02-admin-overview.png` | Overview |
| `03-admin-entries.png` | Entries |
| `04-admin-entry-editor.png` | Entry editor |
| `05-admin-content-type-builder.png` | Content type builder |
| `06-admin-workflows.png` | Workflows |
| `07-admin-analytics.png` | Analytics |
| `08-admin-tenant-switcher.png` | Tenant switcher, open |
| `09-admin-philosophy-and-resources.png` | Philosophy and resources |
| `10-proposed-modules.png` | Proposal — Modules |
| `11-proposed-agents-mcp.png` | Proposal — Agents (MCP) |
| `12-proposed-media.png` | Proposal — Media |
| `13-proposed-review.png` | Proposal — Review |
| `14-proposed-candidate-primitives.png` | Proposal — candidate primitives table |

The screenshots are a convenience for reading this document away from a browser. **The `.dc.html`
files are authoritative** — they carry hover states, live interaction, exact computed values, and
text you can select and copy.

## The proposal file is not a ticket

`Proposed - barakoBrew gaps and modules.dc.html` covers four things the repo's own `ROADMAP.md` names
but has not built: **Modules** (issue #185 — what the instance actually loaded, per-module document,
route and seeder counts), **Agents (MCP)** (roadmap 3.26.0 — tools generated from the content schema,
routed through existing RBAC), **Media** (grid, focal-point picker, named variants, reference counting
that blocks deletion), and **Review** (draft → review → changes requested → approved, stated
explicitly as *not* the same thing as workflow automation, because `ROADMAP.md` warns about that
collision). Plus nine candidate primitives run through the README's own module-or-core tests: seven
are modules, Review and Localization fail and are core.

**The structural finding worth reading:** three of the nine want a Marten projection, and
`IModuleSchema` exposes only `For<T>()`. `DECISIONS.md` already flags that as the first thing to
change if a module ever needs one.

Treat all of it as a spec to discuss, not work to start.

## Suggested order of work

1. Swap the theme in `globals.css` — tokens, radius, fonts. **Stop for review.** Every existing
   screen improves for free at this point.
2. Build the shell: sidebar with grouping, counts, badges and connector health; 60px toolbar; the
   floating panel; the optional rail.
3. Overview, since it is what everyone sees first, including the command palette and event stream.
4. Entries, then the entry editor with its version rail.
5. Content type builder — including all 20 field types from the registry.
6. Workflows, then Analytics.
7. Then discuss the proposals before building any of them.

## Open questions

- **Dark mode** is deferred. Tokens are designed to invert; nothing has been drawn.
- **Vendor icon set** for the Analytics 18px slots — confirm vendoring simple-icons (CC0) and the
  API-side favicon cache before that screen is built.
- **Undrawn screens.** Accounting, Users, Roles, Groups, API keys, Audit, Errors, Health, Security and
  Settings inherit the theme but keep their current layouts. The philosophy section exists so they can
  be built without another design pass; say the word if you want any of them drawn.
