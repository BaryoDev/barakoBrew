repo: BaryoDev/barakoCMS
branch: master

## Last sync

date: 2026-09-08T00:00:00Z

### Updated in this project

- Finalised the barakoBrew admin design and rebuilt `design_handoff_barakobrew/` around it: the superseded `barakoCMS 2026 - Signal.dc.html` is gone, `barakoBrew - Admin design.dc.html` is the deliverable, and the README is rewritten as a per-screen implementation spec (tokens, status vocabulary, 20 field types, the 22-kind action registry, the Analytics vendor-mark rule, order of work).
- Resolved a status-colour contradiction between the screens and the philosophy card: **Scheduled** is now accent (`#4034A8` on `#EEEBFD`) everywhere — Entries table, entry-editor header and the Overview "Needs you" row — and the card's **Published** and **Archived** swatches were corrected to the pairs the screens use (`#0B7A6B` on `#E6F7F4`, `#63687D` on `#F2F3F9`).
- Regenerated all nine admin screenshots at 1x.

## Sync history

date: 2026-09-07T03:41:20Z

### Updated in this project

- Answered Arnel's field-type question from `barakoCMS/Core/Validation/FieldTypeRegistry.cs`: there are **20** types, not the 8 the builder showed. The Add-a-field picker is now grouped (Text, Numbers, Time, Structured, Checked on write) and carries all of them, plus the `integer`/`number`/`boolean` aliases and the note that a new type is one registry entry.
- Analytics breakdowns gained marks: sprite glyphs for device (new `ic-desktop` and `ic-tablet` symbols), and 18px monogram chips in each vendor's own colour for OS, browser and referrer rows. Deliberately not the vendors' logos — the footnote states the 18px slot takes a locally vendored CC0 set, and that referrer favicons must be fetched and cached API-side rather than from a favicon service, for the same reason the Umami proxy exists.

## Sync history

date: 2026-09-07T01:05:00Z

### Updated in this project

- Read `README.md`, `CHANGELOG.md` (Unreleased 4.0.0) and `ROADMAP.md` for the 4.0 release and the console split.
- Site landing gained a barakoBrew band: the console is now its own repo (`BaryoDev/barakoBrew`, image unchanged at `ghcr.io/baryodev/barako-admin`), v1 teased for "a few weeks", six v1 features, and a compatibility panel stating that 4.0 cannot be driven by the 3.21 admin (string enums, the `items` envelope, ProblemDetails, 401 on sign-in failure, `/api/content-types`).
- Nav gained a barakoBrew entry on all five site screens and the mobile menu; the docs sidebar gained a six-page barakoBrew group.
- Hero badge now announces 4.0 (.NET 10, one version across all 13 modules) instead of semantic search; roadmap renumbered onto 4.x with a barakoBrew v1 row.
- Added a mobile audit of the three 390px screens (1 fixed, 3 fixes, 4 calls) to the review panel.

- Verified in code that `BarakoCMS.Email.Smtp` and `BarakoCMS.Files.S3` are real projects (Suite + Tests references, release pack loop): the site now says **14 modules** and carries a card for each; every module card reads 4.0.0.
- Playground password moved behind a Reveal control.
- Copied all fourteen `BarakoCMS.*/assets/icon.svg` files in. They are a per-module-colour system with a shared `#FFC53D` accent and no bean; the icon sheet now shows them beside the new lavender tiles plus a third option that puts the bean on each module's own colour.
- AI gained a dedicated mark (nine-dot lattice, centre and two neighbours enlarged) instead of borrowing the search glyph.
- Added `design_handoff_site/` — a 1:1 implementation spec for the five site pages.

## Sync history

date: 2026-09-05T04:10:00Z

- Site page gained Modules, Docs, Changelog and Community screens, all written from README/ROADMAP/MODULES/CHANGELOG (module table, the module-or-core tests, the delivery-API reference, the 4.0 breaking list, contributors and support policy).
- Admin Overview is now interactive: ⌘K command palette, tenant switcher with token-reissue notice, animated 7/30/90-day stats, resolvable "Needs you" rows with undo, pausable live event stream, toasts.
- Added a Connectors group to the admin sidebar (Resend, SMTP, GitHub/Google OAuth, Umami, Ollama, S3, outbound webhooks) with live/mocked/off status.
- Workflows: replaced the four-chip action row with a 22-kind action library grouped by Content, Delivery, Comms, Data and Flow, plus a fully configured HttpRequest action (templated URL, headers, JSON body template, auth, timeout, retry, on-failure, run-if, idempotency key) and a note that a new action kind is a module implementing IWorkflowAction, never a core edit.

- Split the work into two pages: `barakocms.com - Site design.dc.html` (landing + philosophy + resources) and `barakoBrew - Admin design.dc.html` (eight admin screens + philosophy + resources). Earlier exploration files removed.
- Audited every landing-page claim against `README.md` and `ROADMAP.md`. Fixed the "editorial workflow is in the core" claim (approval workflow is absent; "workflow" means automation rules), the module count (13), and the `Program.cs` registration; cut the unsourceable star count and "deploy in 3 minutes".
- Added six repo-grounded sections: real quickstart, the 13 modules, "What it does not do yet" + not-an-enterprise-vendor, "Where free ends" licence table, playground demo, and the Saturday release order through 3 Oct.
- Added a "Claim revisions" ledger to the site philosophy card recording each change and its source.

- Recreated the current admin and the barakocms.com landing page from source, with the repo's own Line Awesome icons vendored as an SVG sprite.
- Explored three 2026 redesign directions; Signal (indigo, Sora + Manrope, 14px radius) was chosen.
- Built Signal across nine screens: landing, sign in, Overview, Entries, entry editor, content type builder, Workflows, Analytics, tenant switcher.
- Admin product renamed to barakoBrew in the admin chrome; the marketing site stays BarakoCMS.

## Screen map

| Project screen | Repo files |
| --- | --- |
| Current State — Admin Overview | `admin/src/app/(admin)/page.tsx`, `admin/src/app/(admin)/layout.tsx`, `admin/src/components/app-sidebar.tsx`, `admin/src/components/app-header.tsx`, `admin/src/components/brand.tsx`, `admin/src/lib/navigation.ts`, `admin/src/components/analytics/overview-analytics.tsx`, `admin/src/components/analytics/sparkline.tsx`, `admin/src/components/patterns/page-header.tsx`, `admin/src/components/patterns/status-badge.tsx`, `admin/src/components/ui/{card,button,badge,sidebar,select,breadcrumb}.tsx`, `admin/src/app/globals.css`, `admin/src/app/layout.tsx` |
| Current State — Entries | `admin/src/app/(admin)/content/page.tsx`, `admin/src/components/ui/table.tsx`, `admin/src/components/patterns/pagination-controls.tsx` |
| Current State — Entry editor | `admin/src/app/(admin)/content/[id]/page.tsx`, `admin/src/components/content/dynamic-form.tsx`, `admin/src/components/ui/{tabs,switch,input,textarea}.tsx` |
| Current State — Content types | `admin/src/app/(admin)/schemas/page.tsx`, `admin/src/app/(admin)/schemas/new/page.tsx`, `admin/src/components/patterns/empty-state.tsx` |
| Current State — Sign in | `admin/src/app/login/page.tsx` |
| Current State — Site landing | `site/app/page.tsx`, `site/app/layout.tsx`, `site/app/globals.css`, `site/app/ledger.tsx`, `site/app/bean.tsx` |
| Redesign Directions (1a/1b/1c) | Content and IA derived from the screens above; visual language is new |
| Site — Landing claims, modules, quickstart, licence table, roadmap | `README.md`, `ROADMAP.md` |
| Signal — Workflows | `admin/src/app/(admin)/workflows/page.tsx`, `admin/src/app/(admin)/workflows/new/page.tsx`, `admin/src/types/workflow.ts`, `admin/src/components/workflow/action-icon.tsx` |
| Signal — Analytics | `admin/src/app/(admin)/analytics/page.tsx`, `admin/src/components/analytics/sparkline.tsx`, `admin/src/hooks/use-analytics.ts` |
| Signal — Tenant switcher | `admin/src/components/tenant-switcher.tsx`, `admin/src/hooks/use-tenants.ts` |
| Proposed — Modules, Agents (MCP), Media, Review, candidate primitives | `ROADMAP.md`, `README.md` (gap table, module-or-core tests, marketplace tag), `MODULES.md` contract as described in README |
| icon-sprite.js | `admin/src/components/icons/index.tsx` (Line Awesome by Icons8) |
