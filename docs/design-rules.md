# Design rules

The rules a reviewer cites on a UI change. They come from the philosophy screen
(`docs/design/barakobrew-2026/screenshots/09-admin-philosophy-and-resources.png`) and the
second-round handoff (`docs/design/barakobrew-2026-r2/README.md`). Where the two disagree, the
second-round handoff wins, since it is newer. Cite a rule as "design-rules R4".

Fonts and colours are the tokens in `src/app/globals.css`. The screenshot names Sora and Manrope;
the console ships Bricolage Grotesque, Instrument Sans and JetBrains Mono (see CHANGELOG).

## Principles

- R1. Surface the hidden features. A capability with no visible home in the UI does not exist for the user.
- R2. Show the destructive consequence. An irreversible action says what it will do, in place, before it happens.
- R3. Density first, breathing room in panels. Tables run at 44px rows with hairline dividers; panels get the padding, never the other way round.
- R4. Mono means machine. Slugs, IDs, timestamps, scopes, versions, counts, API paths and template variables are always mono with `tabular-nums`. A human value is never mono.
- R5. State is always named. One chip vocabulary with identical colours everywhere, never a bare colour dot.
- R6. No modal for real work. Editing happens in place or in a right rail. Overlays are for choosing, confirming and previewing only.

## Layout shell

- R7. Every screen mounts inside the shell: sidebar 236px, sticky toolbar, fluid content, optional 320px rail. A screen does not draw its own chrome.
- R8. Row height is 44px minimum, for table rows and list items alike. It is also the minimum hit target.
- R9. Control height is 44px for form fields, 38 to 40px by default, 36px compact, 34px small.
- R10. Radius is 14px on panels, 10 to 11px on controls, 8 to 9px on chips.
- R11. Cell padding is 12 to 14px, panel padding 16 to 18px. Nothing larger.
- R12. Structure comes from 1px hairlines (`--border`), not shadows. The popover shadow is the only elevation.

## Typography

- R13. Page title in Bricolage Grotesque 600. Panel head 14.5 to 15px. Row text 13.5px. Field label 12px.
- R14. Metadata is JetBrains Mono 400 at 11 to 12.5px.

## Status vocabulary

- R15. Status is shown with `StatusBadge` (`src/components/patterns/status-badge.tsx`) and its tones, which are the token pairs from BaryoDev/barakoBrew#8. No page picks its own `bg-amber-*` or `bg-emerald-*`.
- R16. Content states are Draft (muted), In review (warning), Scheduled (accent), Published (success), Archived (subtle). A sixth state needs a decision entry.
- R17. A tone is never used without its label. Colour alone does not carry state.

## Route audit

Audited against the source under `src/app/(admin)/` on the commit this file was added. Verdicts:
conforms, needs change, needs a design decision.

### Gaps shared by every table

- S1. needs change, R8: `TableCell` is `p-2` and `TableHead` is `h-10` (`src/components/ui/table.tsx`), and only some pages pad their own cells (`schemas` uses `py-3.5`). The rest run under 44px. One change to the shared component, not per route.
- S2. needs change, R4: mono values are set as `font-mono text-xs` without `tabular-nums` on most pages. Only 13 of the 45 pages use `tabular-nums` at all.

### Routes

The issue lists seven settings children; the source has nine (`connectors`, `deliveries`, `devices`, `email`, `forms`, `import`, `portability`, `requests`, `security`), all rows below.

| Route | Verdict | Reason |
| --- | --- | --- |
| `accounting` | needs change | Account type uses a plain `Badge` (page.tsx:54); the ledger opens in a dialog but is read only, which R6 allows. Only the account code is mono, dates and amounts are not checked against R4. |
| `api-keys` | needs a design decision | Creating a key happens in a dialog (page.tsx:151), which breaks R6, but the secret is shown once and the dialog is how `RevealOnce` works. Scopes and tenants are plain `Badge`s. |
| `audit` | needs change | Success chip is a local emerald class (page.tsx:39), not `StatusBadge` (R15). Timestamp, actor and tenant cells are not mono (R4). Detail dialog is a preview, fine. |
| `content/new` | conforms | A type picker with a `PageHeader`, no tables, no local colours. S1 and S2 still apply. |
| `email-events` | needs change | The Complained chip is a local amber class (page.tsx:37), R15. The address is mono, the time is not (R4). |
| `errors` | needs change | Warning chip is a local amber class (page.tsx:81), R15. Count is mono with `tabular-nums`, timestamp and tenant are not. Detail dialog is a preview, fine. |
| `feature-flags` | needs change | Key is mono, but "scoped" is a plain `Badge` and the rollout percent is human text, not mono (R4). The row is `py-3` list rows, so also under R8. |
| `ops/health` | conforms | Uses `StatusBadge` throughout and mono for node names (page.tsx:123). |
| `pwa` | needs change | The installed chip is a local emerald class (page.tsx:151), R15. |
| `queries` | conforms | Mono slug and counts with `tabular-nums`, `ConfirmDialog` only for confirming. Built after the design but follows R4 and R6. |
| `roles` | needs change | System and owner markers are plain `Badge`s. Nothing is mono, and the reach column is machine-produced (R4). |
| `roles/new` | needs a design decision | The role editor is the shared `RoleEditor` form, no drawn layout for a permission matrix of this size. |
| `roles/[id]` | needs a design decision | Same editor as `roles/new`. |
| `schemas` | conforms | `StatusBadge` for type markers, mono with `tabular-nums` for counts, rows padded `py-3.5` (page.tsx:222). |
| `schemas/[name]` | needs change | The field table shows API name and type, none of them mono (R4). Delete and add use dialogs, which are confirms and choices (R6 allows). |
| `settings` | needs a design decision | A key and value list with an inline `Switch` per row, no drawn shell for a general settings page. |
| `settings/connectors` | needs a design decision | New and Edit connector are dialogs (page.tsx:209), which breaks R6, and a connector edit form is long. Rail or page is a design call. |
| `settings/deliveries` | conforms | `StatusBadge` for state, mono for ids, paging by `PaginationControls`. |
| `settings/devices` | conforms | `StatusBadge` for trust state, the revoke dialog is a confirm. |
| `settings/email` | needs change | Source markers are plain `Badge`s, and the from address and API key source are not mono. |
| `settings/forms` | needs change | Type name is mono (page.tsx:124); the verify field `select` and per-row switch sit in a table at under 44px. |
| `settings/import` | needs change | Status is plain text and a `role="status"` paragraph (page.tsx:281), not a chip (R5). |
| `settings/portability` | conforms | Values and the file name are mono (page.tsx:49, 170). |
| `settings/requests` | conforms | 13 mono usages, built against R4. Only S1 applies. |
| `settings/security` | needs change | MFA On and Off is a plain `Badge` (page.tsx:118), not the status vocabulary, and nothing is mono. |
| `tenants` | needs a design decision | New tenant and Domains are dialogs (page.tsx:106, 205), which breaks R6. Active state is a plain `Badge`. |
| `user-groups` | needs a design decision | Create and Edit group are one dialog (page.tsx:276), R6. |
| `users` | needs change | Username, email and role chips are plain, created date is not mono (R4). No dialogs. |
| `workflow-runs` | conforms | `StatusBadge` for state, mono and `tabular-nums` for counts and ids, retry is a `ConfirmDialog`. |
| `workflows/[id]` | conforms | `StatusBadge`, mono for the trigger and run values. |

## Left from this audit

- Conform each `needs change` row, one ticket per route or small group.
- File an issue for each `needs a design decision` row: `api-keys`, `roles/new`, `roles/[id]`, `settings`, `settings/connectors`, `tenants`, `user-groups`.
- Fix S1 once in the shared table component.
