# Handoff: barakoBrew console enhancements

## Overview
An enhanced barakoBrew, the console for barakoCMS. Version 2 already had these screens: Overview, Entries, Entry editor, Content types, Workflows, Analytics and Site settings, plus ⌘K and the tenant switcher. This round adds or reworks:

1. **Workflow runs**: a live monitor built on the real run model.
2. **Modules**: barakoBrew detects every first-party module and gives each one an interactive screen.
3. **Overview**: clickable stat cards with sparklines, quick actions, a system status strip and Workflow health.
4. **Workflows**: real recent runs and health numbers; **Run now** fires a real run.
5. **Sidebar**: icons, plus a collapsible Modules group.

These screens are what barakocms.com demos on its home page. If they change, the site demos change too (see `../design_handoff_barakocms_site/`).

## About the design files
`barakoBrew - Admin.dc.html` is a **design reference built in HTML**. It is a working prototype, not production code. Rebuild it in **BaryoDev/barakoBrew**: Next.js app router, TanStack Query, zod schemas, shadcn/ui primitives, and the `StatusBadge`, `EmptyState`, `ErrorState`, `ConfirmDialog` and `PageHeader` patterns. Use the components already there; restyle them to these tokens.

Per **D20 in the barakoCMS repo's DECISIONS.md**: barakoBrew owns none of the rules. Every action here is a call to the barakoCMS API. Module screens are first-party and **detected by presence**, so one release runs against an API with or without each module. There is no plugin model.

## Fidelity
**High fidelity** for layout, colour, type, copy and states. Sample data (runs, module rows, sparklines) is illustrative.

## Shell
- **Grid**: `auto minmax(0,1fr)`. Sidebar 236px wide, sticky, 100vh, `--surface`, right border. **Below 1000px** the sidebar becomes a drawer: fixed position, `translateX(-105%)` when closed, .3s `cubic-bezier(.2,.8,.2,1)`, with a `--scrim` overlay. A sticky top bar appears with a ☰ button (44×44), the wordmark, the breadcrumb **"{tenant} / {screen}"** and a ⌘K button.
- **Sidebar, top to bottom**:
  - wordmark + `{brew.Version}`
  - "Search or jump to ⌘K"
  - tenant switcher (switching re-issues the token)
  - main nav
  - **MODULES** group
  - theme toggle and sign out
- **Main nav items**: 36px tall, radius 9, 18px Line Awesome icon. Active: `--surface2` background, 600 weight, icon in `--accent`. Items and icons:

| Item | Icon | Count shown |
| --- | --- | --- |
| Overview | `ic-dashboard` | |
| Entries | `ic-content` | entries |
| Content types | `ic-content-types` | |
| Workflows | `ic-workflows` | active workflows |
| Workflow runs | `ic-history` | runs that are Failed or Partly failed |
| Analytics | `ic-analytics` | |
| Site settings | `ic-settings` | |

- **MODULES group**: a 12px/600 uppercase toggle showing the installed count and a ▾ that rotates −90° when collapsed. It lists the installed modules (34px rows with 17px glyphs). Modules with a warning get a 7px `--warn` dot (in the sample, Diagnostics and Email · Resend). The last row, **All modules**, uses `ic-cube`.
- The nav scrolls when it overflows.

## Screens

### Overview
- Header: tenant name, "Good morning, Ana", and a 7 / 30 / 90 days segmented control.
- **Stat cards**: 4 in an auto-fit grid (min 180px). Each is a **button** with a label + →, the value (Bricolage 32/600), a delta, and a **12-bar sparkline** (5px bars, height 8 to 34px). The last bar is `--accent`; the others `--accent-soft`. The Failures card uses `--bad`/`--bad-bg` instead. Hover: lift −2px, shadow, accent border. Targets:

| Card | Opens |
| --- | --- |
| Published | Entries filtered to Published |
| Drafts | Entries filtered to Draft |
| Workflow runs | Workflow runs, all |
| Failures | Workflow runs filtered to Partly failed |

- **Quick actions**: 40px pills, each with a 24px round `--accent-soft` icon (New entry `ic-plus`, Fire a workflow `ic-play`, Upload a file `ic-archive`, Site settings `ic-settings`). Fire a workflow starts "Publish and announce" and opens Workflow runs.
- **System strip**: a pill on `--surface2` with four status items, each a 7px dot + bold label + value:
  - API: `api.cafe.example · 4.5.0`
  - Modules: `16 detected`, opens All modules
  - Diagnostics: `1 warning · mail transport` (warn dot), opens the Diagnostics module
  - Runner: `idle` or `running a workflow` (accent dot when running), opens Workflow runs
- **Needs you**: rows that can be resolved, with undo. "A run partly failed" opens Workflow runs.
- **Live activity**: a feed that can be paused.
- **Workflow health**: one row per active workflow, a button opening its latest run. Each row shows name + trigger, the last 10 outcomes as 7px bars (Succeeded 22px `--ok`, Failed `--bad`, Partly failed `--warn`, Running 14px `--accent`, Cancelled `--line`), the success rate (≥90% `--ok`, ≥70% `--warn`, otherwise `--bad`), and a last-status chip.

### Workflow runs (new): `src/app/(admin)/workflow-runs/page.tsx`
This keeps the existing page's model and guards (see `src/hooks/use-workflow-runs.ts`) and adds a live view, a timeline and per-attempt detail.
- **Header**: H1 "Workflow runs" + "Every firing of a workflow, newest first. Open one to see what each of its actions did." On the right, a **Live / Paused** switch: a 38px button with an 8px dot (`--ok` pulsing 1.4s when live).
- **Status filter**: a segmented control with counts: Every status, Running (includes Pending), Failed, Partly failed, Succeeded, Cancelled. Changing it resets to page 1 and **never sends `status=` empty** (`runListParams`).
- **Layout**: `minmax(320px,420px) minmax(0,1fr)`; one column below 1180px. On one column, **selecting a run scrolls to the detail** (in `componentDidUpdate` / `useEffect` after the render, not in a timeout).
- **Run list rows**: buttons, radius 12. Each shows a status chip with a dot (pulsing when Running), a failure-kind outline chip (Temporary `--warn`, Permanent `--bad`), the start time, "{workflow} · {entry}", the trigger in mono, and a progress strip of 16×6px segments, one per action, coloured by action state.
- **Run detail card**:
  - Title, status chip ("Partly failed · Temporary"), and **Cancel run** (only for Pending/Running; asks first).
  - Facts, 2-column: Trigger, Content type, Content, Started, Finished, Runs on (`built-in runner` when the executor is null), Run.
  - **Actions timeline**: a 28px circle on the left with a 2px connector line.

| Action state | Circle |
| --- | --- |
| Succeeded | ✓ on `--ok` |
| Running | ordinal, pulsing, accent |
| Failed and waiting to retry | ↻ in warn |
| Failed | ✕ on `--bad` |
| Unknown | ? in warn |
| Skipped / Cancelled | - |

  - Each action card shows the type in mono accent, the label, the status chip (or "Failed · retrying"), the kind chip, and **Retry** (`ic-refresh`). The facts list holds Attempts, Took (`formatDuration`), Response (≥400 shown in `--bad`), **Next attempt in N s** (warn), "If it fails: Stops the run" and "Skipped because: action N failed". The error appears in a `pre` on `--surface2`.
  - A context note at the bottom explains the state, using the copy in the prototype for Running / Unknown / Partly failed / Permanent / Cancelled / Succeeded.
- **Retry rules** (unchanged from the repo):
  - Shown only for `Failed` or `Unknown` actions, and only when the run is not stopped or rolled back.
  - Never shown while the action is backing off.
  - `Permanent` asks "This failure will not fix itself by retrying. Retry anyway?". `Unknown` asks about possible duplicate delivery and the idempotency key.
  - Retrying an action re-queues it **and the actions skipped after it**.
  - Guard against double clicks with a ref set in the same tick, as `retryInFlight` does.
  - After a retry or cancel, **invalidate the queries; don't paint the response body**.
- **Live view**: poll `GET /api/workflow-runs` and the selected run every **2s** while Live is on and the tab is visible. Upgrade to SSE if the API adds it.
- The dashed **"Prototype" box** (Slack is down / Fire a run) exists only for the demo. **Do not ship it.**

### Workflows
The existing list and definition, plus:
- Three health tiles: Runs here, Succeeded %, Avg. action.
- **Recent runs**: the latest 5, each with a status chip, entry, progress strip and start time; clicking opens the run.
- **Run now** fires a run and opens Workflow runs on it.
- "All runs →" opens Workflow runs.

### All modules (new)
- H1 "Modules", the sentence "barakoBrew finds modules by asking the API what it runs…", and a mono chip `GET /api/modules · {installed} of {total}`.
- Category filter with counts: All, Content, Comms, Access, Platform, Insight, Business.
- Cards in an auto-fill grid (min 280px). Each has a 44px icon tile, name, category, a chip (**Detected** in `--ok`, or **Not installed** muted), a description, and the package + version in mono.
  - Installed: **Open** button.
  - Not installed: **Copy install**, which copies `dotnet add package …` and shows a toast "Restart the API and its screen appears." Not-installed cards are at opacity .78.

### Module screen (new, one template for all 16)
- **Header**: 60px accent tile with the glyph, H1, description, **Detected** chip and `{pkg} {ver}` chip.
- **Stats**: 3 tiles, Bricolage 28.
- **Body**: `minmax(0,1.5fr) minmax(320px,1fr)`; one column below 1180px.
- **Table card** (left):
  - Title + row count, a **Filter** input, and the primary action, which adds a row, runs an effect, or both:

| Module | Primary action |
| --- | --- |
| Pages | New page |
| Forms | New form |
| Files | Upload |
| Files · S3 | Test connection |
| Import | New import |
| Portability | Export now |
| Email · Resend | Send test |
| Email · Smtp | Send test |
| Feature flags | New flag |
| Diagnostics | Run all checks |
| AI | Reindex |
| Accounting | New invoice |

  - **Column headers sort**: ascending, then descending, then off, with ▲/▼. Numbers sort numerically.
  - Rows can be clicked and open the **drawer**.
  - Status words render as chips:
    - `--ok`: Published, Succeeded, Delivered, Sent, On, Pass, Paid
    - `--bad`: Bounced, Failed
    - `--warn`: Partly failed, Warn, Open
    - muted: Draft, Off, Void, Never
  - **On/Off cells render a 36×20 switch** that toggles in place (stop propagation), with a toast. The On/Off text sits beside it as plain text.
  - Empty filter shows: Nothing matches "…".
- **Drawer** (right, 420px, `slidein` .28s, scrim):
  - Breadcrumb, row title (Bricolage 24), fields as a list with status colours, and the module's row actions. The first action is accent; destructive actions are in `--bad`.
  - **Remove can be undone** from the toast.
  - The footer shows the API call in mono, for example `GET /api/feature-flags/new-editor`.
  - Row actions per module are in `MACT` in the prototype, for example Publish / Move to draft, Revoke trust, Roll out to 50% / everyone, Mark paid / Void, Send again / Remove from suppression.
- **Try it card**: the same scripted console as the site, with the case chips, Run / Run again, lines every 420ms and the result bar.
- **Configuration card**: read-only key/values from the API's configuration, with the note "Set in appsettings or environment, not here: barakoBrew owns none of the rules."

## State and data
- **Runs**: the `WorkflowRun` and `WorkflowActionAttempt` schemas in `use-workflow-runs.ts`.
  - Run statuses: `Pending, Running, Succeeded, Failed, PartiallyFailed, Cancelled`.
  - Action statuses: those plus `Unknown` and `Skipped`.
  - `retryable` decides the failure kind: `true` is Temporary, `false` is Permanent, `null` is not said.
- **Module detection**: `GET /api/modules`, cached per tenant. Show the Modules group and screens only for detected modules.
- **Module data endpoints**: one per module. The paths in the prototype are placeholders; confirm against each module's endpoints. Tables page through `?page&pageSize`, and filter and sort on the server where the endpoint supports it.
- **Local UI state** (not persisted unless noted): theme (`localStorage['bk-brew-theme']`), Live on/off, filters, sort, drawer row, nav and drawer open, MODULES group expanded, toasts (3.8s, with optional undo).
- **API gaps** needed for full fidelity:
  - (a) **attempt history per action**: the API stores only `attempts` plus the last error, while the design lists every attempt
  - (b) **push or efficient polling** for live runs
  - (c) **a configuration read endpoint** for the module Configuration card
  - Until these exist, show the attempt count and the last error only (as the current AttemptCard does).

## Interactions & motion
- Easing `cubic-bezier(.2,.8,.2,1)`. Screen enter `rise` (8px, .35s). Popovers `pop` (.18s). Toasts `toast`. Live dots `pulse` (1 to 1.4s).
- Switch knob: `left` .25s.
- Respect `prefers-reduced-motion`.
- Every interactive row is a real button or link, keyboard reachable. Dialogs use `role="dialog"` with `aria-modal`, and Esc closes popovers.
- The minimum hit target on narrow screens is 44px.

## Design tokens
**Light**

| Token | Value |
| --- | --- |
| `--bg` | `#F7F7FA` |
| `--surface` | `#FFFFFF` |
| `--surface2` | `#F1F2F8` |
| `--line` | `#E5E6EF` |
| `--ink` | `#101223` |
| `--ink2` | `#2B2E45` |
| `--muted` | `#5D6178` |
| `--accent` | `#5A46D6` |
| `--accent-ink` | `#FFFFFF` |
| `--accent-soft` | `#EEEBFD` |
| `--accent-text` | `#4034A8` |
| `--code` | `#14162A` |
| `--code-ink` | `#E6E7F2` |
| `--ok` / `--ok-bg` | `#0B7A6B` / `#E6F7F4` |
| `--warn` / `--warn-bg` | `#8A5A00` / `#FFF4DB` |
| `--bad` / `--bad-bg` | `#A3261F` / `#FDECEC` |
| `--scrim` | `rgba(16,18,35,.3)` |

**Dark**

| Token | Value |
| --- | --- |
| `--bg` | `#0B0C16` |
| `--surface` | `#14162A` |
| `--surface2` | `#1C1F36` |
| `--line` | `#272A45` |
| `--ink` | `#EEEFF8` |
| `--ink2` | `#D2D4E4` |
| `--muted` | `#A0A4BD` |
| `--accent` | `#8E7DF5` |
| `--accent-ink` | `#0B0C16` |
| `--accent-soft` | `#25214A` |
| `--accent-text` | `#B9AEFF` |
| `--code` | `#090A14` |
| `--ok` / `--ok-bg` | `#4FD1B8` / `#0F2C29` |
| `--warn` / `--warn-bg` | `#F2C060` / `#2E2410` |
| `--bad` / `--bad-bg` | `#FF8A80` / `#341716` |
| `--scrim` | `rgba(0,0,0,.55)` |

**Shadow**: `0 1px 2px rgba(16,18,35,.05), 0 12px 32px -14px rgba(16,18,35,.18)`.

**Typography**
- Headings: Bricolage Grotesque 600. H1 32px at −.035em; card titles 19 to 22px.
- Body: Instrument Sans, base **14.5px**.
- Mono: JetBrains Mono, 11 to 13px.

**Radii**
- Nav items and small buttons: 9 to 10px
- Inputs: 11 to 12px
- Cards: 14 to 18px
- Chips: 999px

## Assets
- `icon-sprite.js`: Line Awesome glyphs from `admin/src/components/icons/index.tsx`. The prototype uses `ic-dashboard`, `ic-content`, `ic-content-types`, `ic-workflows`, `ic-history`, `ic-analytics`, `ic-settings`, `ic-cube`, `ic-refresh`, `ic-plus`, `ic-play`, `ic-archive`, plus each module's glyph.
- Module glyphs: Pages `ic-content`, Forms `ic-field-edit`, Files `ic-archive`, Files · S3 `ic-database`, Import `ic-table`, Portability `ic-cube`, Email · Resend `ic-send`, Email · Smtp `ic-envelope`, External sign-in `ic-key`, Device trust `ic-shield`, Feature flags `ic-flag`, Diagnostics `ic-bug`, PWA `ic-mobile`, Analytics · Umami `ic-analytics`, AI `ic-ai-mark` (a nine-dot lattice inlined in the prototype; add it to the icon set), Accounting `ic-coins`.

## Files
- `barakoBrew - Admin.dc.html`: the prototype. Open it with `support.js` beside it. Tweaks:
  - `startScreen`: open on a given screen, including `runs`, `suite` and `mod`
  - `suite`: on means all 16 modules are installed, off means 8 (shows detection by presence)
  - `showSyncFields`: shows sync placeholders
- `support.js`: the prototype runtime only.
- `icon-sprite.js`.
- Repo files this extends: `src/app/(admin)/workflow-runs/page.tsx`, `attempt-card.tsx`, `src/hooks/use-workflow-runs.ts`, `src/lib/navigation.ts`, `src/components/app-sidebar.tsx`, `src/app/(admin)/page.tsx`, `src/app/(admin)/workflows/page.tsx`.
