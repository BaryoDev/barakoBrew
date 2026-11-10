# barakoBrew: external UX review and the changes made

Reviewed: `barakoBrew - Admin.dc.html` (v1). Enhanced: `barakoBrew - Admin v2.dc.html`.
Scope asked for: the brand, the Overview (the admin's landing screen) and Sign in. Goal: intuitive,
easy to use, and tells an admin what is happening on their site, with an optional AI.

Everything else (Entries, Editor, Workflows, Runs, Modules…) is untouched in v2.

---

## 1. Brand

### What works
- Two-tone wordmark (`barako` in ink, `Brew` in accent) and the rotated bean mark are distinctive and
  cheap to reproduce. Keep them.
- Bricolage Grotesque for headings + Instrument Sans for body gives a warm, non-generic voice.
- The tokens are already disciplined: one accent, three status colours, one mono.

### What was weak
- **The brand had no voice.** v1's only brand copy was the word "Sign in" and the greeting. Nothing
  told a new admin what barakoBrew *is* or what it promises.
- **The bean was decorative only** (26–34 px). It never appeared at a size that could carry a screen.
- **No convention for AI-written content.** With an AI module arriving, the console needs a visible,
  consistent way to say "a model wrote this, here is where it came from".

### Decisions made in v2
- **Promise line**: *Know what your site is doing before anyone asks.* Used on Sign in; reusable on
  barakocms.com.
- **Voice rules** (apply everywhere): plain words, present tense, no exclamation marks, no jargon
  from the API surface ("Contract 9 · console speaks 1 to 9" was removed from the Overview). Say
  what happened, then what only a person can decide.
- **AI marker**: the nine-dot lattice (`ic-ai-mark`) is the only glyph that may introduce AI-written
  text, and AI text always ends with a provenance line ("Written by BarakoCMS.AI from your last
  24 hours… check the link before you act"). Never present a model's sentence as a system fact.
- **The bean at hero size** (64 px) on the brand panel, on `--code` navy. This is the one place the
  brand is allowed to be large.

---

## 2. Sign in

### Findings (v1)
| # | Finding | Severity |
| --- | --- | --- |
| S1 | The instance you are signing in to (`api.cafe.example`) is the most important context in a multi-instance product, and it was 13 px mono under the title. | High |
| S2 | No error state, no "forgot password", no show/hide password. | High |
| S3 | Device trust exists as a module (30-day trust, OTP for a new device) but Sign in never mentioned it. The first-run experience of the security model was invisible. | High |
| S4 | Provider buttons were plain text with no marks; "GitHub" before "Google" with no reason. | Medium |
| S5 | Theme toggle lived in the card header next to the logo, competing with the brand. | Low |
| S6 | No explanation of how provider sign-in matches an account (verified email, per D10). | Low |

### Changes (v2)
- **Split layout** ≥ 900 px: brand panel left (navy, bean beside the promise line, one paragraph), form right.
  Below 900 px the panel hides and a compact wordmark + instance host sits above the form.
- **"You are signing in to" card** on the brand panel: tenant tile, name, host in mono, reachability
  (`Reachable · 42 ms`), core version, module count. Pre-auth it shows *only* reachability, nothing
  from inside the tenant.
- **Form**: Welcome back; email; password with Show/Hide and *Forgot it?*; **Trust this device for
  30 days** as an explained checkbox (default on, with the shared-computer caveat); primary button
  with a disabled/busy state; Google and GitHub with their marks; one footnote on how matching works
  and how to get an account.
- **Error state**: a password under 8 characters shows the inline `✕ That password did not match…`
  with the remaining-tries hint and a reset link. The field border turns `--bad`.
- **Two ways in**, as a segmented control above the form: **Password** and **Email code** (passwordless: the address, then the same 6-digit step).
- **Code step** serves three cases with one layout: new-device email code, passwordless email code, and an **authenticator (TOTP)** code. A swap row under the links moves between email and authenticator (*Use authenticator* / *Email me a code*); the authenticator variant offers *Use a recovery code* instead of resend.
- **New-device step** (tweak `newDevice`, default on): after a correct password, *Check your email*
  with a 6-digit code field (mono, 26 px, auto-filters to digits), Continue disabled until 6 digits,
  *Send a new code*, *Not you? Go back*, and a note that explains what trusting does. `000000`
  demonstrates the wrong-code state. Once a device is trusted, signing out and back in skips the step,
  which is the behaviour the module actually has.
- Theme toggle moved to the bottom-right corner of the form column.

---

## 3. Overview

### Findings (v1)
| # | Finding | Severity |
| --- | --- | --- |
| O1 | **No answer to "is my site OK?"** Four stat cards, a status strip, Needs you, Live activity and Workflow health all had equal weight; the admin had to read everything to find out. | High |
| O2 | "Good morning, Ana" was hard-coded regardless of time. | Medium |
| O3 | Stat deltas were ambiguous: "−3" on Drafts (good or bad?), "+12%" against what? | Medium |
| O4 | System strip mixed plain facts with jargon ("Contract 9 · console speaks 1 to 9") and had no overall verdict. | Medium |
| O5 | Live activity mixed absolute seed times (09:41) with wall-clock times for live events (19:35), so the feed looked out of order. | Medium |
| O6 | Needs you said *what* but never *why* or *what will probably happen if I act*. | Medium |
| O7 | The range control appears to collide with the cards in DOM-to-image captures. Measured in the live DOM it does not (the control sits at x 661 on the header row); recorded here so nobody chases it. | None |

### Changes (v2)
- **Verdict line** under the greeting: *Your site is up. 3 things need you, one of them a decision
  only you can make.* Dot colour follows severity. Empties to *…nothing is waiting on you.*
- **Time-aware greeting** and the date.
- **The Brief** (new, first card). With AI on: a 3–4 sentence paragraph written from the same data
  the screen already has. Every number or claim is an inline link to the screen that proves it
  (the run, the scheduled entries, the Resend deliveries). Below it: *Suggested next* chips, an
  **Ask** box with three starter questions, and the provenance footer. Answers show *Read from*
  chips naming the API calls, so the admin can see the model only read what the console reads.
  **Rewrite** regenerates the prose (the prototype alternates two phrasings).
- **With AI off** (tweak `ai`, or *Turn the brief off*): the same card becomes **Today at a glance**,
  a rule-based list of the same facts in severity order, with a one-line nudge to turn the brief on.
  This is the module-by-presence rule from D20 applied to the AI: the layout does not change, only
  whether prose is available.
- **Needs you** rows gain an AI line (lattice glyph, accent text) that says why and what to expect:
  *The same Slack hook returned 200 three times today after this timeout; a retry now will most
  likely succeed.* Hidden when AI is off. Each row's button now deep-links (the run itself, Entries
  filtered to Scheduled, the Resend module) instead of a generic screen.
- **Health strip** now leads with a verdict pill (*1 warning* / *All systems normal*) and uses plain
  words: API up · 5.1.0, Database 4 ms, Storage S3 ok, Mail 2 bounces, Runner idle. Hover titles
  carry the detail. The contract-version item moved out (it belongs on All modules). Resolving the
  bounce item in Needs you flips Mail to *delivering* and the pill to *All systems normal*, so the
  strip and the list never disagree.
- **Stat deltas** read as sentences: *+12% vs prior*, *3 fewer*, *1 for you*.
- **Live activity** uses relative time (*now*, *2 min*, *1 h*) so live and seeded items sort visibly.

### Open questions for the team
1. Where does the AI brief run? The copy says *on your own instance with a local model*, which is
   true for `BarakoCMS.AI` today (Ollama). If a hosted model is ever allowed, the provenance line must
   change and the Overview should say so.
2. Should the verdict line be derived server-side (one endpoint, one definition) rather than from
   whatever the console happens to have loaded? D12's reasoning about derived status applies.
3. Scripted answers in the prototype match on keywords. The real thing needs the API facts in the
   prompt and should refuse rather than guess when a fact is not in them.

---

## 4. Tweaks in `barakoBrew - Admin v2.dc.html`
- `ai` (Overview): brief + Ask on, or the rule-based glance.
- `newDevice` (Sign in): show the emailed-code step after the password.
- `startScreen`, `suite`, `showSyncFields`: unchanged from v1.
