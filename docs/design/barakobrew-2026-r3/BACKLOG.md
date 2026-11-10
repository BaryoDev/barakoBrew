# Backlog designs: five screens drawn from open tickets

File: `barakoBrew - Admin v2.dc.html`. The five screens live in the console itself: **Activity**, **Tenants**, **Roles** and **API keys** are sidebar items after Site settings, and **Staff desk · Press** opens the barakoPress page full-screen with a *Back to barakoBrew* button. Tweak `startScreen` accepts `activity`, `tenants`, `roles`, `keys`, `desk`. Tokens, type and shell are shared with every other screen. Each screen names the ticket it answers and the API it reads, so the build is a
conform-to-drawing job rather than a design call.

Read on 22 Oct 2026: barakoCMS 5.1.0, barakoBrew 1.11.0 and barakoPress 0.15.0 changelogs,
`docs/design-rules.md`, `src/lib/navigation.ts`, and issues barakoBrew #9 #146, barakoCMS #677 #917,
barakoPress #7 #26.

## 1. Role editor — barakoBrew #146, barakoCMS #917, design-rules "roles/new needs a design decision"
- **Why**: 1.11.0 shipped transition permissions "read back as a sentence" but the rest of #146 (row
  rules, a preview) and #917 (readable/writable field sets) still have no drawn screen, and the
  shared `RoleEditor` is the one route the audit could not grade.
- **Layout**: capabilities as labelled checkboxes (label + mono key), then one card per content type
  behind tabs showing a `CRUD` summary in mono. Inside: Actions as pressed chips; Transitions as
  switches with a condition select (*on any entry / only their own / only in their department*);
  **Which rows** as a condition builder limited to the API's four operators and `$CURRENT_USER`,
  with `Class.Instructor` showing the one-reference form from barakoCMS #827; **Which fields** as a
  Read/Write grid with each field's sensitivity chip (Write disabled until Read).
- **Right rail (340px)**: *Reads back as* — every rule as a sentence, recomputed live; *Preview as*
  a chosen user — which entries they would see and why not (`not theirs`, `no read`), to be read
  from `dryRun`.
- **API**: `PUT /api/roles/{id}` with `permissions[type].{create,read,update,delete,transitions,
  conditions,readableFields,writableFields}`.

## 2. Tenants — design-rules R6 (no modal for real work), 5.0 tenant status, 5.1 tenant mail
- **Why**: the audit marks `tenants` "needs a design decision" because New tenant and Domains are
  dialogs.
- **Layout**: a 44px-row table (status, mode, sign-up policy, domains in mono, member count); the
  row opens a **440px right rail**. Status is three cards, each stating its consequence in place
  (R2): Suspended answers 404 on delivery and 403 to its own callers. Site mode is a segmented
  control with a one-line note per mode (Live / Holding / Private). Domains list + add. Mail sender
  shows the 5.1 tenant override with the rule that account mail always uses the host.
- **Save** names the consequence: *Save and suspend*. Footer carries `PUT /api/tenants/{handle}`.

## 3. API keys with rotation — barakoCMS 5.1 `POST /api/api-keys/{id}/rotate`
- **Why**: rotation with an overlap window shipped in the API with no console screen.
- **Layout**: table with scopes as mono chips, content-type limit, last used, state. **Rotate** opens
  a rail: a 7-stop overlap slider (none → 7 days, 60 min default and explained), what stays the same,
  the note that `*` excludes `files:read`/`files:write`. After issuing: the new key shown once
  (`RevealOnce` pattern, copy button, gone on close), the old key's stop time, and *Stop the old key
  now*. The list then shows the new key Active and the old one **Overlap · stops in 60 min**.

## 4. Activity feed vocabulary — barakoCMS #677, barakoBrew #9, D4
- **Why**: the Overview feed and Needs you are gated on a projected activity endpoint that does not
  exist, and D4 forbids leaking event type names. Someone has to propose the vocabulary; this is it.
- **Nine kinds**, each a stable dotted name owned by the API: `published`, `scheduled`, `edited`,
  `run.succeeded`, `run.failed`, `bounced`, `signin`, `imported`, `type.changed`. Each has a tone, a
  glyph and a sentence template. An unknown kind renders as its name in mono.
- **Row shape** (shown as JSON on the screen): `id, at, kind, severity, actor{kind,name},
  subject{kind,id,title}, text, ref`. `ref` is the console deep link; `severity` feeds Needs you.
- **Endpoint**: `GET /api/activity?since=&kinds=` with a cursor, polled like workflow runs.
- **Screen**: filter chips with counts (Everything, Problems, Publishing, Workflow runs, Sign-ins,
  Imports), Live/Paused, 48px rows: tile, relative time, sentence, kind chip.

## 5. Operator desk on barakoPress — barakoPress #26 (closed 0.15.0 for `dataTable`), #7 (viewer sessions, first slice shipped)
- **Why**: proves the D22 ladder — an operations screen from blocks, no code. Drawn in the site's
  own theme (Kapé Ana, #B4572E), not the console's, because it is a barakoPress page.
- **Page** `/staff/catering`, audience Front of house + Owner (anyone else gets 404). `dataTable`
  over `catering-request` (filters, search, row link) → `recordPanel` (fields the viewer may read)
  → two `transitionButton`s: Approve, Decline with a required reason. After a decision the panel
  shows what the workflow did, read from the viewer's own token.
- **"How is this built?"** reveals the block configuration as it would appear in barakoBrew.
- **Still needed in Press**: gated `dataTable` reading as the viewer, `recordPanel`,
  `transitionButton`, page-level role gating (all listed on #26/#7).

## Order of work suggested
1. Activity vocabulary (API first; unblocks Overview, Needs you and the stat deltas).
2. API key rotation rail (API already shipped; smallest UI).
3. Tenants rail (closes an audit row).
4. Role editor (largest; #917 field sets may land after the rest).
5. Operator desk (Press, after #7's gating slice).

## Review round, 22 Oct (Arnel's comments)
- **Sign-in method tabs** wrap to two lines at 400px: tabs set `nowrap`.
- **Module tables get a List / Grid toggle** (icon pair beside Filter, state `mView`). Grid draws one card per row: a 96px tile (gradient + eye glyph for an image file, archive glyph for other files, the module glyph otherwise), the row's status word as a badge, first column as the title, the rest as a meta line. Same drawer on click. Default stays List.
- **Content types get an icon.** The type header shows a 44px icon button; it opens a picker with 20 Line Awesome glyphs plus a *Custom SVG* box. A pasted SVG is accepted only if it has a `viewBox` and at least one shape; scripts, styles, `fill`/`stroke`/`on*` attributes are stripped and shapes are forced to `currentColor`, then it is registered as `ic-custom-N`. Stored as `icon` on the definition (`{ name }` for a sprite glyph, `{ svg }` for a custom one) and served to the console and barakoPress (which already supports a site sprite, Press 0.13 `IconSprite`). The icon is used in the type list, the Entries type tabs and type column, and ⌘K results.
  - API ask: `icon` on `ContentTypeDefinition`, additive; a sanitiser on write (same rules as above) so the console never trusts stored markup.
