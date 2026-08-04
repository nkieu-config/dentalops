# W11 — Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visual identity across every screen — ink-on-porcelain instead of teal-on-slate, Plus Jakarta Sans instead of a font that never loaded, softer shapes and spring motion instead of flat rectangles — without losing a single behaviour, and build the Settings screen the README has promised since W0.

**Architecture:** The redesign is almost entirely a token-layer change. `grep` over `apps/web/src` finds **zero** hardcoded hex values and **zero** raw Tailwind palette classes outside `app.css`, so the palette swap propagates from one file. What is *not* free: the seven UI primitives, the shell, and per-screen layout work. Settings is a different animal — it is a backend project wearing a frontend hat, and is scoped as its own phase for that reason.

**Tech Stack:** React 19, Tailwind CSS v4, TanStack Query, Zod v4, NestJS 11, Prisma, PostgreSQL 16, Vitest, Jest + Supertest, Playwright.

---

## Global Constraints

- No code comments. Well-named identifiers and clear structure carry the meaning.
- No `Co-Authored-By` or any AI-attribution trailer in commit messages.
- Never read, print, or commit `.env` contents.
- `docs/design-system/MASTER.md` is the source of truth. It was rewritten *before* this plan. If the code and MASTER.md disagree, MASTER.md is right or MASTER.md gets edited — never a silent divergence.
- Cross-tenant denial is **404, never 403**. Within-tenant role denial is **403** with a machine-readable `errorCode`.
- Every new endpoint is registered in `apps/api/test/tenant-isolation.spec.ts`. `REGISTRY` values are the string union `"public" | "auth-only" | "not-found" | "filtered"`.
- The repo is on **zod v4**: `z.uuid()`, `z.email()`, `z.iso.datetime()`, `z.looseObject()`. Never `z.string().uuid()`.
- Adding a field to a shared contract requires `pnpm --filter @dentalops/contracts build` before the API suite sees it.
- Playwright runs against **built** artifacts and reuses a running server. Run `pnpm build` before any e2e run that touches API or web source.
- Vitest sets `onUnhandledRequest: "error"`. Any new fetch introduced by a redesigned screen fails its test loudly until a handler exists — that is intended, do not weaken it.
- Run every gate **separately** with `--force`, echoing the exit code on its own line. Never pipe a gate into `grep` or `tail`; never chain with `&&`.

## Hard rules the redesign must not break

These already have tests. Breaking one is a regression, not a design choice.

- `apps/web/e2e/a11y.spec.ts` fails the build on any *serious* or *critical* axe violation at 390px and 1440px across landing, booking, login, signup, patients, timeline and roster. It also asserts a visible focus outline, no horizontal overflow, and no clipped nav labels.
- **`lib/geometry.ts` hardcodes `PX_PER_MIN = 16/15`, which is `--spacing-hour: 4rem` divided by 60.** The timeline's entire layout maths derives from it. `--spacing-hour`, `--spacing-slot`, `--spacing-timegutter`, `--spacing-col-min` and `--spacing-col-md` **do not change in W11**. If a later week wants a different grid density, that constant and the token move together or the grid silently misaligns.
- Touch targets stay ≥ 44px at 375px. The existing `Input` is `h-9` (36px); forms already opt into `h-11` on small screens.
- Public booking body text never drops below 16px (iOS auto-zooms on focus below that).
- No status is conveyed by colour alone — every one carries an icon or a text label.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `apps/web/scripts/verify-contrast.mjs` | Parses `app.css`, checks all 92 pairs in both themes, exits non-zero on failure |
| `apps/web/e2e/visual.spec.ts` | Screenshot baselines: every screen × 4 widths × 2 themes |
| `apps/web/e2e/screens.ts` | The shared list of screens and viewports the visual and a11y suites both iterate |
| `apps/web/src/lib/motion.ts` | Spring easing and duration constants, so no component invents its own |
| `apps/web/src/components/ui/card.tsx` | The surface primitive the screens keep re-implementing by hand |
| `apps/web/src/components/ui/badge.tsx` | Semantic chip using the new `*-surface` / `*-on-surface` tokens |
| `apps/web/src/features/settings/settings-page.tsx` | Settings shell with section nav |
| `apps/web/src/features/settings/clinic-section.tsx` | Clinic name and public booking URL |
| `apps/web/src/features/settings/branches-section.tsx` | Branch list, opening hours editor |
| `apps/web/src/features/settings/services-section.tsx` | Service list, duration, buffer, colour, active |
| `apps/web/src/features/settings/resources-section.tsx` | Chairs and equipment |
| `apps/web/src/features/settings/staff-section.tsx` | Staff list, role, deactivate |
| `apps/api/src/directory/directory-write.controller.ts` | Branch / service / resource writes |
| `apps/api/src/tenant/tenant.controller.ts` | `GET` and `PATCH` the clinic profile |
| `apps/api/prisma/migrations/*_branch_is_active` | Soft-delete column for Branch |

**Modified:** `apps/web/src/app.css`, `apps/web/src/main.tsx`, `apps/web/package.json`, every file under `apps/web/src/components/ui/`, `apps/web/src/components/shell/app-shell.tsx`, all nine feature screens, `apps/web/src/pages/landing-page.tsx`, `apps/web/src/pages/dev-ui-page.tsx`, `apps/web/src/routes.tsx`, `apps/web/e2e/a11y.spec.ts`, `apps/api/src/directory/directory.service.ts`, `apps/api/src/staff/`, `packages/contracts/src/directory.ts`, `docs/design-system/MASTER.md`, `README.md`.

---

## Phase A — Foundation

Nothing in Phase A changes a layout. It changes what things are made of, and it installs the two machines that make the rest of the week safe to attempt.

### Task 1: Capture the baseline before touching anything

A redesign without a before-picture cannot be reviewed, only argued about. This task must complete and be committed **before Task 3**.

**Files:**
- Create: `apps/web/e2e/screens.ts`, `apps/web/e2e/visual.spec.ts`

**Decisions:**
- **Screens and widths come from one exported list**, so the a11y suite and the visual suite can never drift apart about what "every screen" means.
- **Widths are 375 / 768 / 1024 / 1440**, matching MASTER.md §4's reference widths.
- **Both themes**, set by writing `localStorage["dentalops-theme"]` before the first navigation — that is the same key `initTheme()` reads.
- **The demo banner is masked, not hidden.** `app-shell.tsx` renders an amber "Demo mode — the clinic data rebuilds itself every 6 hours" strip whenever `isDemo()` is true, which shifts everything below it by ~24px. Masking it with Playwright's `mask` option keeps the layout honest while stopping the rebuild countdown from making every screenshot a false diff.
- **Animations disabled** via `animations: "disabled"` so a mid-transition frame never becomes the baseline.

- [x] **Step 1: The shared screen list**

`apps/web/e2e/screens.ts` exports `VIEWPORTS` (the four widths with sensible heights) and `SCREENS`: an array of `{ name, path, auth: "none" | "owner", setup? }`. Public entries are `/`, `/login`, `/signup`, `/book/demo-clinic`, `/dev/ui`. Authenticated entries are `/app/timeline`, `/app/roster`, `/app/patients`, `/app/activity`. `/manage/:token` needs a booking first — reuse the helper `apps/web/e2e/public-booking.spec.ts` already has rather than writing a second one.

- [x] **Step 2: The visual spec**

For each screen × viewport × theme, log in when required using the exact recipe the a11y suite uses — `page.goto("/")`, click *Try as Owner*, wait for `/app/timeline` — then navigate. Owner is the right role because nav visibility is role-gated and only Owner shows all five items.

Use the timeline and roster deep-link params so the screenshots contain real data rather than an empty day: timeline `?d=<YYYY-MM-DD>&b=<branchId>`, roster `?w=<weekStart>&b=<branchId>`. `e2e/helpers.ts` already exports `nextMonday()`, `dayWindow()` and `bkkDayLabel()`; the seeded data is Asia/Bangkok and picking a date by hand will give you an empty grid.

```ts
await expect(page).toHaveScreenshot(`${name}-${width}-${theme}.png`, {
  fullPage: true,
  animations: "disabled",
  mask: [page.getByTestId("demo-banner")],
  maxDiffPixelRatio: 0.01
})
```

Add `data-testid="demo-banner"` to the strip in `app-shell.tsx` — it is the only source change this task makes.

- [x] **Step 3: Generate and eyeball the baselines**

```bash
docker compose up -d
pnpm --filter @dentalops/api exec prisma migrate deploy
pnpm build
pnpm --filter @dentalops/api db:seed
pnpm --filter @dentalops/web exec playwright test e2e/visual.spec.ts --update-snapshots
```

Open every generated PNG. A baseline you have not looked at is worse than no baseline — it locks in whatever was broken. Note anything already wrong; those are Phase B and C's first fixes, not regressions you introduced.

- [x] **Step 4: Record the other two numbers**

Recorded 2026-08-05 against the seeded demo tenant (120 patients, 397 shifts, 1,388 appointments):

| Measure | Baseline | Notes |
|---|---|---|
| Lighthouse performance (mobile, `/book/demo-clinic`) | **95** | MASTER.md §7 claimed ≥ 90 and never gated it. The claim was true. |
| Lighthouse accessibility | **100** | |
| Lighthouse best-practices / SEO | **100 / 100** | |
| LCP / FCP / Speed Index | 2.3 s / 2.1 s / 2.1 s | |
| Total blocking time | 10 ms | |
| Cumulative layout shift | **0.088** | Under the 0.1 threshold, but only just. The font swap in Task 3 is the most likely thing to push it over. |
| `e2e/a11y.spec.ts` | **20 / 20 green** | |
| Baseline screenshots | **80 PNG, 7.5 MB** | 10 screens × 4 widths × 2 themes |

### What the baselines showed — defects that already existed

Per Step 3: these are Phase B and C's first fixes, not regressions the redesign introduced.

1. **Short appointment cards clip their own text.** In `timeline-1440-light`, the 12:20–12:50 card renders three lines into a 30-minute slot that is 32px tall; the patient name is sliced in half and hidden under the next card. Any appointment ≤ 30 minutes at default zoom has this. Task 12 owns it.
2. **Dark-mode inputs are effectively invisible.** `login-375-dark` shows three form fields whose borders vanish into the background — the visual confirmation of the `--input` 1.22:1 measurement. Task 4's token swap fixes it.
3. **The demo banner never renders after a hard navigation.** `isDemo()` reads in-memory session state, and `page.goto()` reloads the app, so `refreshSession()` restores the session without the demo flag. The `mask` in the visual spec is currently a no-op. Harmless for screenshots, but it means a demo user who reloads loses the banner that explains the data resets.
4. **The activity feed screenshots the test that took them.** `activity-375-light` contains one row — "Anong Prasert checked the roster" — written moments earlier by this same run visiting `/app/roster`. Its content and its timestamp are both non-deterministic.

### Two limits on what this suite can be

Discovered while generating, and they change how the suite should be used rather than blocking it.

- **The baselines are time-dependent and will rot.** `nextMonday()` moves every week, the seed generates appointments relative to now, and the activity feed timestamps are wall-clock. A run next month diffs against a different world.
- **Snapshots are written as `<name>-visual-darwin.png`.** Playwright appends project and platform. CI runs Linux and renders text differently, so these files can never match there. Already handled: `4f116b2` split the Playwright config into `functional` and `visual` projects and pointed CI's `e2e` script at `functional` only, so the visual suite is out of the gate by construction.

Together: **this is a same-session before/after instrument, not a durable CI gate.** That is exactly what the redesign needs — capture, change, compare within a day. If a durable gate is ever wanted, it needs Linux baselines generated inside the CI container and a frozen clock; neither is worth doing for W11.

- [x] **Step 5: Commit**

```bash
git add apps/web/e2e apps/web/src/components/shell/app-shell.tsx
git commit -m "test(web): screenshot baselines for every screen before the redesign"
```

### Task 2: The contrast verifier

MASTER.md §7's own lesson from W8: a checklist item no machine checks is a statement of intent. The token set in MASTER.md §2 was produced by this script and three failures were fixed before it was written down; the script becomes a gate in Task 4 so the next palette edit cannot regress it.

**Files:**
- Create: `apps/web/scripts/verify-contrast.mjs`
- Modify: `apps/web/package.json`, `turbo.json`

- [x] **Step 1: Write the script**

**It parses `app.css` rather than holding its own copy of the tokens.** A verifier with a duplicated table verifies the duplicate, and the two drift the first time someone edits one of them — which is the exact failure mode W8 recorded. Reading the shipped stylesheet makes that impossible. It accepts an optional path argument so a candidate palette can be checked before it is adopted.

For each theme it checks: `foreground` and `muted-foreground` against all five surfaces at 4.5:1; every button label against its fill at 4.5:1; every semantic chip's text against its own surface at 4.5:1; each semantic colour as text on the page background at 4.5:1; `--input` against both card and background at **3:1** (WCAG 1.4.11 — a form control's boundary is required to identify it); `--ring` against `--ring-offset` at 3:1; and for all six data hues, card title and subtitle on the fill at 4.5:1 plus the 3px stripe against the page at 3:1.

It prints only failures, then a total, and exits non-zero. It also **fails on a token the design system names but `app.css` does not define**, so a half-finished palette cannot pass by having nothing to check. Ninety pairs is the count once the W11 tokens land; 78 against the pre-W11 palette, which lacks the six new tokens.

- [x] **Step 2: Prove it fails — three ways**

A verifier that has never gone red is not known to work, and one that only goes red is not known to be satisfiable.

| Proof | Input | Expected | Result |
|---|---|---|---|
| Red | the shipped `app.css` | exit 1 | 6 failures: `--muted-foreground` at 4.34:1 on secondary and accent, `--input` at 1.23:1 light and 1.22:1 dark |
| Green | the token block extracted from MASTER.md §2 | exit 0 | all 90 pairs pass |
| Mutation | that same good palette, `--input` alone reverted to a hairline | exit 1, naming only `--input` | 2 failures, both `--input`, nothing else disturbed |

The mutation proof is the one that matters: it shows the script fails *specifically*, not globally.

- [x] **Step 3: Make it runnable — but do not make it a gate yet**

`"verify:contrast": "node scripts/verify-contrast.mjs"` in `apps/web/package.json`, and a `verify:contrast` task in `turbo.json` with `inputs` on `src/app.css` and the script so the result caches.

**It is deliberately not added to the `test` task's dependencies here.** CI runs `pnpm test` → `turbo run test`, and the script exits 1 against the palette that is still shipping. Wiring the gate in this task would turn main red and keep it red for the whole of Task 3, which pushes straight to main with no PR to hide behind. **Task 4 flips the gate on in the same commit as the tokens that satisfy it** — the first moment the repo can honour it. Verified at the time of writing: `turbo run verify:contrast` exits 1 while `turbo run test` is 6/6 green.

- [x] **Step 4: Commit**

```bash
git add apps/web/scripts apps/web/package.json turbo.json
git commit -m "test(web): a contrast verifier that reads the stylesheet it checks"
```

### Task 3: The font that was never there

**Files:**
- Modify: `apps/web/package.json`, `apps/web/src/main.tsx`, `apps/web/src/app.css`
- Create: `apps/web/src/lib/font.test.ts`

**The bug being fixed.** `main.tsx` imports `@fontsource-variable/inter`, which registers the family `'Inter Variable'`. `app.css` declares `--font-sans: "Inter", ui-sans-serif, system-ui, sans-serif`. `"Inter"` does not match `"Inter Variable"`, so the declared family never resolved and every visitor without Inter installed locally has been reading `system-ui` — SF Pro on macOS, Segoe on Windows — while the bundle downloaded an Inter file it never rendered. There is no console warning for this; CSS font fallback is silent by design.

- [x] **Step 1: Write the test first**

`font.test.ts` hardcodes no package and no family name. It reads the `@fontsource` import out of `main.tsx`, resolves *that* package, reads the family it registers, and compares it to the first family in `app.css`'s `--font-sans`. Deriving both ends means the test keeps working after the next font change instead of becoming a stale assertion about Plus Jakarta Sans. It also asserts the family carries fontsource's ` Variable` suffix and that `tnum` is still switched on. String-level on purpose — jsdom does no real font matching, so asserting on a rendered font would pass vacuously.

- [x] **Step 2: Run it against the current state, watch it fail**

Failed 2 of 3 as required: the family comparison (`Inter` vs `Inter Variable`) and the suffix assertion. The `tnum` assertion passed, which is correct — that part was never broken.

- [x] **Step 3: Swap the package**

```bash
pnpm --filter @dentalops/web remove @fontsource-variable/inter
pnpm --filter @dentalops/web add @fontsource-variable/plus-jakarta-sans
```

Import it as the first line of `main.tsx`, before `./app.css`. Set `--font-sans: "Plus Jakarta Sans Variable", ui-sans-serif, system-ui, sans-serif`. Change `html { font-feature-settings: "cv11", "tnum" }` to `"tnum"` alone — `cv11` was an Inter character variant and means nothing here. `tnum` is load-bearing and was confirmed present in the Plus Jakarta Sans variable file before the family was chosen.

- [x] **Step 4: Look at the timeline, and pay the bill**

Tabular figures survive: the hour gutter and every appointment's time range stay in a single column at 1024px and 1440px. Thai falls back cleanly — Plus Jakarta Sans is Latin-only, so the seeded clinic name `ยิ้มสวย ทันตคลินิก` renders in the system Thai face beside Latin chrome without looking broken. That mixture is now permanent unless a Thai webfont is added later; it is not worth the bundle for a product whose UI is English.

**The bill: Lighthouse performance 95 → 94, and FCP 2106 ms → 2254 ms.** Measured three times (93 / 94 / 94), so it is real and not run variance. CLS held at **0.088**, unchanged, which was the risk actually worth worrying about.

The cause is not a regression to hunt. *The page got slower because the font now loads at all.* Before this task the family name never matched, so the browser matched no `@font-face`, downloaded nothing, and rendered `system-ui` — the 95 was measured on a page that silently refused its own typeface. Fixing the bug costs one 27 KB `woff2` on Lighthouse's simulated slow 4G.

Checked and rejected: this variable package ships no per-subset stylesheet, so a latin-only import is not available, and `index.css` is 1.7 KB — the CSS is not the cost. `font-display: swap` is already set on all four faces, which is why CLS did not move. Clawing the point back would mean preloading the hashed `woff2` or self-subsetting; both are optimisation work, neither belongs in this task.

**Exit criterion 6 is re-based accordingly** — a floor measured against a broken state was never a real floor.

- [x] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/src/main.tsx apps/web/src/app.css apps/web/src/lib/font.test.ts pnpm-lock.yaml
git commit -m "fix(web): actually load the font the design system names"
```

### Task 4: The token swap

**Files:**
- Modify: `apps/web/src/app.css`

**Interfaces produced, consumed by every later task:** `--decorative` / `--decorative-surface` / `--decorative-on-surface`; `--destructive-surface` / `--destructive-on-surface` and the same pair for warning and success; `--ring-offset`; `--radius` at `0.625rem` with a new `--radius-xs` at 4px.

- [x] **Step 1: Paste the token tables from MASTER.md §2**

Both `:root` and `.dark` blocks verbatim. They are the verified set — do not adjust a value here without re-running Task 2's script and updating MASTER.md in the same commit.

- [x] **Step 2: Extend `@theme inline`**

Register the new colour tokens as `--color-*` so Tailwind generates utilities for them, and add `--radius-xs: 0.25rem` plus the widened `sm`/`lg`/`xl` steps.

- [x] **Step 3: Fix the ring offset — and not the way this step originally said**

The instruction here was to set `--tw-ring-offset-color: var(--ring-offset)` on `:root` and `.dark`. **That does not work.** Tailwind v4 registers the property as `@property --tw-ring-offset-color { syntax: "*"; inherits: false; initial-value: #fff }` — confirmed by grepping the built stylesheet. With `inherits: false` a `:root` declaration never reaches a descendant, so the fix would have looked done and changed nothing: exactly the class of silent failure Task 3 just finished cleaning up.

What shipped instead: `Button` — the only component in the app using `ring-offset` — carries `focus-visible:ring-offset-background`, which resolves through `--color-background` and follows the theme.

`--ring-offset` was **deleted rather than added**. It would have been identical to `--background` in both themes and read by no stylesheet, and a declaration that looks authoritative while nothing consults it is the precise shape of the font bug. The verifier now checks `--ring` against `--background` and `--card`, which is the property that actually has to hold. That is 92 pairs, up from 90.

- [x] **Step 4: Keep the six data hues exactly as they are**

The `--hueN-bg` / `--hueN-border` pairs do not change. `service.colorIndex` is stored, so changing them would be a data migration for zero benefit. They were re-verified against the new porcelain and ink backgrounds — all six stripes clear 3:1 against the page in both themes.

- [x] **Step 5: Run the verifier, then turn it into a gate**

Run it first. It must go from the 6 failures it reports today to zero — that is the proof the paste was faithful:

```bash
pnpm --filter @dentalops/web verify:contrast; echo "contrast exit=$?"
```

Only once it is green, add `"verify:contrast"` to the `test` task's `dependsOn` in `turbo.json`. Task 2 deliberately left this undone so main would not sit red through Task 3. Confirm the gate is real by running the pipeline CI runs:

```bash
pnpm turbo run test --force; echo "test exit=$?"
```

Then break one token, confirm `pnpm test` now fails on it, and restore. A gate nobody has watched fail is not known to be wired.

- [x] **Step 6: Look at every screenshot diff**

```bash
pnpm --filter @dentalops/web exec playwright test e2e/visual.spec.ts
```

Every screen will differ — that is the point. Read the diffs as a review of the palette, not as failures. Do **not** update the baselines yet; they get refreshed once at the end of each phase, so a phase's total visual change is reviewable in one place.

**41 of 48 differed** (7 passed, all of them screens whose change fell under the 1% `maxDiffPixelRatio`). What the review found:

- **The central thesis holds visibly.** On the timeline the chrome is warm stone and the appointment fills are cool tints, so the cards separate from the page without either raising its voice — which is the whole argument for moving slate → stone, seen working rather than asserted.
- **The dark-mode input fix is dramatic.** Baseline `login-375-dark` showed three fields with no perceptible boundary; the same shot now shows three clearly bounded inputs. This is the single most visible improvement in the task.
- **Cards now separate from the page at all.** Previously `--card` and `--background` were both `#ffffff`, so a card was defined only by its border. White on porcelain gives a real, if slight, edge.
- **The 30-minute-card clipping is unchanged**, as expected — it is a layout bug, not a colour one, and belongs to Task 12.

**Note for later phases:** `maxDiffPixelRatio: 0.01` is too loose to trust as pass/fail. It absorbed a whole-app font change on text-light screens in Task 3 and 7 screens of a whole-app palette change here. **Investigated before Phase B — see "The threshold was the wrong question" below.**

---

## The threshold was the wrong question

Asked before Phase B: should the tolerance come down? Measuring first turned the question inside out.

**The experiment.** Set `maxDiffPixels: 0`, change nothing at all, re-run. If the tolerance were merely mis-set, an unchanged app would still pass. Instead **17 of 48 tests failed** — timeline at every width, booking at 768 and up, `/dev/ui` at three. The suite had a noise floor of its own, and `timeline-375` sat at ratio **0.03**, three times the tolerance it was being judged by. Tuning a number was never going to fix that.

**Three causes, found by looking at the diff images rather than the counts.**

| Cause | Evidence | Size | Fix |
|---|---|---|---|
| The webfont finishes loading at a different moment each run | Every glyph outlined in the diff, content identical, positions identical — sub-pixel rasterisation, not different data | ~4,500–5,450 px on booking and timeline | `await page.evaluate(() => document.fonts.ready)` before every shot |
| A live countdown ticks on `/dev/ui` | `countdown-banner.tsx` runs `setInterval(…, 1000)`, and the gallery renders three of them | 44–77 px | mask `[data-testid^="countdown-"]` |
| The activity feed records the run that photographs it | This suite visits `/app/roster` eight times per run; each visit appends an audit row, so the list grows and everything below it shifts | 1,566 px, and **29,096–115,555 px once timestamps were masked** — masking made it worse because the row *count* is what moves | excluded from the suite, with the reason recorded in `screens.ts` |

The first was the whole ballgame: `document.fonts.ready` alone removed every pixel of booking and timeline noise. The middle one was cosmetic. The third is not a tolerance problem at all — a screen cannot be screenshot-tested against a log the test itself writes to, at any threshold.

**Result: 48 of 48 pass at `maxDiffPixels: 0`, verified across a re-seed.** The suite is now byte-deterministic, so the tolerance is not merely lower — it is gone, and any single changed pixel on nine screens across four widths and both themes now fails the run.

**What this changes for Phase B.** The suite graduates from a review aid to a real regression detector. That matters most for exactly the cross-contamination Phase B risks: Task 6 changes the shell every authenticated screen shares, and Task 9 changes the `auth-form` primitives three screens use. Those are the bugs a loose threshold would have hidden.

**What it does not fix.** The baselines are still tied to the calendar — `nextMonday()` moves each week and the seed anchors its data to `new Date()`. Determinism holds within a day, not across weeks, so a stale-baseline failure still means "regenerate", not "regression". And `activity` now has no screenshot coverage; it keeps its a11y coverage and its states are still reviewable in `/dev/ui`.

- [x] **Step 7: Commit**

```bash
git add apps/web/src/app.css turbo.json
git commit -m "feat(web): ink on porcelain, and give every hue back to the data"
```

### Task 5: The primitives

Seven files, 141 lines total, consumed by everything else. Getting these right is most of the redesign.

**Files:**
- Modify: `apps/web/src/components/ui/{button,input,native-select,label,sheet,skeleton,empty-state}.tsx`
- Create: `apps/web/src/components/ui/card.tsx`, `badge.tsx`, `apps/web/src/lib/motion.ts`, and tests for the two new components
- Modify: `apps/web/src/pages/dev-ui-page.tsx`

**Decisions:**
- **`Button` gains press feedback**, `active:scale-[0.97]`, and its resting state gains `shadow-xs`. The `default` variant is now ink; `hover:opacity-90` stays because it works identically on both themes.
- **`Input` and `NativeSelect` get `border-input`**, which is now a real 3:1 border rather than a hairline. They also get `h-11 sm:h-9` so the 44px touch floor is the default instead of something each form remembers.
- **`Card` and `Badge` are extracted, not invented.** Both shapes are currently hand-rolled in several screens; the redesign is the moment to stop duplicating them. `Badge` takes `tone: "neutral" | "success" | "warning" | "destructive" | "decorative"` and reads the `*-surface` / `*-on-surface` pairs.
- **The motion tokens went into `app.css`, not a `motion.ts`.** The plan called for a constants module, but nothing in this task would have imported it — the press scale is a Tailwind class and the sheet transitions are CSS animations, so a TypeScript file of numbers would have been dead code of exactly the kind Task 4 deleted. `--ease-enter` / `--ease-exit` and the six `--animate-sheet-*` / `--animate-overlay-*` entries live in `@theme` instead, which generates real `ease-*` and `animate-*` utilities and puts motion in the same token system as everything else. The rule the plan wanted — no component writes its own `cubic-bezier` — is enforced better this way, not worse.
- **`EmptyState` gains an optional illustration slot** — this is the one place `--decorative` is allowed to be generous.

- [x] **Step 1: Update the existing tests first**

`button.test.tsx` exists. Extend it for the press-scale class and the new variant surface before changing the component.

- [x] **Step 2: Restyle the seven, add the two**

- [x] **Step 3: Extend `/dev/ui`**

The gallery is 637 lines and already renders every primitive in every state with no auth and no network — it is the fastest feedback loop in the repo and the best review surface for this task. Add `Card`, `Badge` in all five tones, and the `EmptyState` illustration variant. Review the whole gallery in both themes before moving on.

- [x] **Step 4: Gates, then refresh the Phase A baselines**

```bash
pnpm --filter @dentalops/web test; echo "unit exit=$?"
pnpm --filter @dentalops/web verify:contrast; echo "contrast exit=$?"
pnpm build; echo "build exit=$?"
pnpm --filter @dentalops/web e2e:a11y; echo "a11y exit=$?"
pnpm --filter @dentalops/web exec playwright test e2e/visual.spec.ts --update-snapshots
```

Review the refreshed PNGs as a set. This is the Phase A design review.

**What the review found, and the one thing it changed:**

- `/dev/ui` renders every primitive, both new components in all five tones, and both `EmptyState` variants. The decorative teal now appears exactly where it was licensed to — the circle behind an empty-state icon — and nowhere else.
- **A gap the verifier could not see.** It checks *text on a surface*, never *surface against what the surface sits on*. Measuring by hand found the dark `--destructive-surface` at **1.01:1 against `--card`** — the same luminance, so a destructive chip in dark mode was a floating red word with no visible chip. Its three siblings sat near 1.09. Raised to `#341b1a`, which is 1.09 against the card and keeps its text at 8.40:1.
- **No mechanical threshold was added for this.** Light-mode chips measure 1.04–1.09 against white by design — they are pale tints, the same low-luminance language the appointment fills use, where hue rather than lightness does the work. A uniform rule would have had to be set low enough to be meaningless or high enough to force the light tints into something loud. The defect was *inconsistency between siblings*, not a threshold breach, and that is what got fixed.
- The 30-minute-card clipping is unchanged and still belongs to Task 12.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/components/ui apps/web/src/lib/motion.ts apps/web/src/pages/dev-ui-page.tsx apps/web/e2e
git commit -m "feat(web): rebuild the primitives on the new tokens"
```

---

## Phase B — Shell and the public face

Public pages first: they are what a stranger — or a recruiter — sees, and they carry the least behavioural risk.

### Task 6: The app shell

**Files:**
- Modify: `apps/web/src/components/shell/{app-shell,offline-banner,out-of-scope}.tsx`

**Decisions:**
- **Active nav becomes a pill** (`--secondary` fill, `--foreground` text, full radius). At `≥1024` the sidebar stays 240px; the icon rail at `768–1023` and the bottom nav below 768 keep their current geometry — `--spacing-topbar` and `--spacing-bottomnav` are unchanged.
- **The theme toggle icon changes with the theme.** It is currently a static `Moon` regardless of state, which tells the user nothing about what the button will do. Sun when dark is active, Moon when light is.
- **The toggle moves out of the authenticated shell.** Landing, login, signup, booking, manage and `/dev/ui` have no way to switch themes today, so a dark-mode visitor gets a light public site. Put it in a small shared header used by the public pages too.
- **Third state: system.** `initTheme()` currently falls back to `prefers-color-scheme` only until the first toggle, after which the user is locked to an explicit choice with no way back. Cycle light → dark → system, and add the `matchMedia` change listener that is missing so an OS switch mid-session propagates while in system mode.

- [ ] **Step 1: Extend `app-shell.test.tsx` and `theme` tests first** — the icon reflects state; the cycle returns to system; a stored `"system"` follows `matchMedia` changes.
- [ ] **Step 2: Implement**
- [ ] **Step 3: `pnpm --filter @dentalops/web test`, then the a11y suite** — the nav-label-clipping assertion is sensitive to the pill's padding; if it goes red, the pill is too fat, not the test.
- [ ] **Step 4: Commit** — `feat(web): a shell that says which theme it is in`

### Task 7: Landing page

75 lines, and the single highest-leverage screen in the repo for its purpose. The three "Try as …" demo buttons stay the primary call to action and stay first in the accessibility tree — that constraint is inherited from W10 and is not up for renegotiation.

- [ ] **Step 1: Update `landing-page.test.tsx`** for whatever structure changes; the demo-button ordering assertion must survive untouched.
- [ ] **Step 2: Rebuild the hero.** Public body text is 16px minimum. `--decorative` may be used generously here; this is the one screen with no data on it.
- [ ] **Step 3: a11y at 390 and 1440, then commit** — `feat(web): a landing page worth the first ten seconds`

### Task 8: The booking wizard and manage page

~1,090 lines across the wizard host, five steps, the countdown banner, the summary, and the patient-facing manage screen.

**Decisions:**
- **Slot buttons keep their rules:** 44px minimum, `tabular-nums`, unavailable slots omitted rather than greyed. A grid of greyed slots reads as broken.
- **The countdown banner keeps `--warning`** and gains the `*-surface` / `*-on-surface` treatment so it stops being a saturated bar. Its urgent state below 60s is a weight and icon change, never colour alone.
- **⚡ Any available stays first** in the dentist step. W6 recorded why, and the reason has not changed.
- **The hold-expired state stays a full replacement of the grid**, never a toast.

- [ ] **Step 1: Run the existing tests, note which assert on classes** — restyle those first so the rest of the work is not fighting red tests.
- [ ] **Step 2: Restyle the five steps and the wizard chrome**
- [ ] **Step 3: The manage page** — 293 lines, and the only screen a patient reaches from an email. It should look finished.
- [ ] **Step 4: `e2e/public-booking.spec.ts` must stay green**, then Lighthouse mobile on `/book/demo-clinic` — compare against Task 1's recorded number and do not ship a regression.
- [x] **Step 5: Commit** — `feat(web): the booking flow, redesigned`

### Task 9: Login and signup

426 lines including the shared `auth-form.tsx` primitives.

The W10 accessibility floor is inherited whole and is already tested: a visible `<label>` per input, errors below their field wired by `aria-describedby` with `aria-invalid` on the input, focus moving to the first invalid field on a failed submit, server field errors landing on their field rather than in a toast, correct `type` and `autoComplete`, and a submit button that disables and says what it is doing.

- [ ] **Step 1: Restyle `Field`, `FieldInput` and `FormError` in `auth-form.tsx`** — the three screens that use them inherit it.
- [ ] **Step 2: The two pages**
- [ ] **Step 3: Full unit suite, a11y, then refresh the Phase B baselines and review them as a set**
- [ ] **Step 4: Commit** — `feat(web): auth screens on the new system`

---

## Phase C — The working screens

Ordered by risk, ascending. Timeline is last because by then the tokens, primitives and shell have been stable for two phases.

### Task 10: Patients and Activity

157 + 116 + 183 lines. Both are list-with-cursor screens with skeletons, empty and error states; they are siblings and should look it.

- [ ] **Step 1: Restyle both, using the new `Card` and `Badge`** rather than the hand-rolled surfaces they have now.
- [ ] **Step 2: Empty states get illustrations** — this is where `EmptyState`'s new slot earns itself, and where the friendly micro-copy replaces "No data".
- [ ] **Step 3: Tests, a11y, commit** — `feat(web): patients and activity, redesigned`

### Task 11: Roster

`roster-page.tsx` is 456 lines, the largest single file in the app: a week grid, drag-to-create, a live-validating violations panel.

**Decisions:**
- **The violations panel keeps its blocking/warning split and its deep links.** Blocking violations still disable Save.
- **`ShiftBlock` gets the same radius discipline as appointment cards** — small blocks, small radius.
- **Drag feedback follows `motion.ts`** and must still track the pointer in real time.

- [ ] **Step 1: Restyle `shift-block.tsx`, `violation-list.tsx`, `roster-list.tsx` first** — the leaves, before the 456-line page.
- [ ] **Step 2: The week grid**
- [ ] **Step 3: `e2e/roster-violation.spec.ts` green, a11y green, commit** — `feat(web): the roster editor, redesigned`

### Task 12: Timeline

~2,100 lines across ten components and eight hooks, of which ~650 lines are behaviour that must not be touched.

**Decisions:**
- **This is a restyle, not a restructure.** Drag, resize, keyboard navigation, realtime arrival, zoom levels, virtualization and column mode all keep their current behaviour and their current geometry. The interaction model was designed in W4–W5 and re-earning it is not this week's work.
- **`--spacing-hour` and its siblings do not move.** See the hard rules — `PX_PER_MIN` is derived from them by hand.
- **`AppointmentCard` keeps `--radius-xs`.** A 15-minute block is 16px tall.
- **The six status treatments are unchanged**: completed at 70% with a check, no-show with a warning stripe and icon, cancelled muted with strikethrough, conflict with a destructive ring and icon, held dashed with a countdown chip. Each keeps its icon; colour is never the only signal.

- [ ] **Step 1: `appointment-card.tsx` (105 lines) alone, and review it in `/dev/ui`** against all six hues × eight states before touching anything else. The gallery renders exactly this matrix.
- [ ] **Step 2: `time-grid.tsx`** — grid lines, hour lines, off-shift hatch, now-line. The hatch must recede; if it competes with a card, it is wrong.
- [ ] **Step 3: The drawers and dialogs** — `create-drawer`, `appointment-drawer`, `series-dialog`.
- [ ] **Step 4: `agenda-view.tsx`, `timeline-toolbar.tsx`, `column-picker.tsx`**
- [ ] **Step 5: The 1000-card perf case in `/dev/ui`** — confirm the new shadows and radii did not cost frame budget. If they did, the shadow goes, not the frame rate.
- [ ] **Step 6: `e2e/drag-reschedule.spec.ts` green, full a11y, refresh Phase C baselines, review**
- [x] **Step 7: Commit** — `feat(web): the timeline, redesigned`

---

## Phase D — Settings

**Read this before starting.** Phases A–C are a redesign. Phase D is a backend project: the Settings *screen* is perhaps 600 lines of React, but the API it needs barely exists. Today, across clinic profile, branches, services, resources and staff, there is exactly **one** write endpoint — `POST /staff`. Everything else is read-only, and two of the reads are not even shaped for management.

If the week runs long, **Phase D ships as W12 and Phases A–C ship without it.** Nothing in A–C depends on it. The `/app/settings` route keeps its existing `OutOfScope` placeholder, which is honest, and the README keeps its existing note. Do not half-build this; a Settings screen that can display but not save is worse than one that says it was cut.

### What has to be built before a form can save anything

| Domain | Exists | Missing |
|---|---|---|
| Clinic profile | *nothing* — `/auth/me` returns only `tenantId` | `GET /tenant`, `PATCH /tenant` |
| Branches | `GET /branches` (omits `timezone`) | `POST`, `PATCH`, `DELETE`, and `timezone` on the read |
| Services | `GET /services` | `POST`, `PATCH`, `DELETE` |
| Resources | `GET /resources` (hardcodes `isActive: true`) | `POST`, `PATCH`, `DELETE`, and an `includeInactive` flag |
| Staff | `GET /staff` (no role guard), `POST /staff` | `PATCH /staff/:id` — there is no way to deactivate a user |

Two traps that must shape the design rather than be discovered later:

- **Branch, Service and Resource all cascade-delete into appointments, shifts and resource claims.** A literal `DELETE` button on any of them silently destroys booking history. Service and Resource already have `isActive`; Branch does not, so soft-deleting a branch needs a migration.
- **`openingHours` is untyped `Json`** with its shape defined only in `apps/api/src/tenant/defaults.ts` as `{mon..sun: [["09:00","20:00"]]}`. Nothing validates it. An editor writing to it needs a real zod schema first, or a bad save corrupts availability for the whole clinic.

### Task 13: Contracts and the clinic profile

- [ ] **Step 1:** Add to `packages/contracts/src/directory.ts`: `openingHoursSchema` (the seven day keys, each an array of `[start, end]` `HH:mm` pairs, validated as ordered and non-overlapping), `createBranchSchema` / `updateBranchSchema`, `createServiceSchema` / `updateServiceSchema`, `createResourceSchema` / `updateResourceSchema`, `updateStaffSchema`, and `clinicProfileSchema`. Build the package.
- [ ] **Step 2:** `GET /tenant` and `PATCH /tenant` (name, slug), `@Roles("owner")`. `Tenant` is deliberately excluded from `TENANT_MODELS` in `prisma/tenant.extension.ts`, so this controller uses the unscoped client and scopes by `currentTenant().tenantId` by hand — copy how `public.service.ts` already reads it. A slug change must 409 `SLUG_TAKEN` on collision, and the response must tell the UI the public booking URL changed.
- [ ] **Step 3:** Tests including cross-tenant 404, then register both in the isolation registry.
- [ ] **Step 4: Commit** — `feat(api): let an owner read and rename their clinic`

### Task 14: Branch, service and resource writes

- [ ] **Step 1:** Migration adding `isActive` to `Branch`, defaulting true.
- [ ] **Step 2:** Write endpoints for all three, `@Roles("owner")`, with **deactivate instead of delete** — the endpoint may be spelled `DELETE` but it sets `isActive: false`. Deactivating the last active branch is a 409, not a 500 three screens later.
- [ ] **Step 3:** Widen `GET /branches` to return `timezone`; add `includeInactive` to `GET /resources` and drop the hardcoded filter, keeping the default behaviour identical so nothing that consumes it today changes.
- [ ] **Step 4:** Tests per endpoint, isolation registry, `pnpm --filter @dentalops/contracts build`.
- [x] **Step 5: Commit** — `feat(api): manage branches, services and chairs`

### Task 15: Staff writes

- [ ] **Step 1:** `PATCH /staff/:id` — name, role, `isActive` — `@Roles("owner")`. An owner cannot demote or deactivate themselves, and the role union still excludes `owner`.
- [ ] **Step 2:** Decide the `GET /staff` guard. It has none today, so any dentist can enumerate colleagues. Leaving it open is defensible for a directory; make it a decision written down rather than an oversight.
- [ ] **Step 3:** Tests, registry, commit — `feat(api): let an owner change a colleague's role`

### Task 16: The Settings screen

- [ ] **Step 1:** Replace the `OutOfScope` element for `settings` in `routes.tsx` with the real screen, lazily imported like its siblings. Five sections behind a section nav — sidebar at `≥1024`, stacked cards below, per MASTER.md §4.
- [ ] **Step 2:** Build the five sections. Forms reuse `useAuthForm`, `Field` and the `Sheet` — this is the same shape of form as the staff dialog and must not grow a second implementation.
- [ ] **Step 3:** The opening-hours editor is the hard one. It edits seven days of interval lists and it is the only control here that can break availability for the whole clinic. It validates against `openingHoursSchema` client-side before it ever submits, and it shows what a day looks like after the edit.
- [ ] **Step 4:** Gate the whole screen on `role === "owner"`; a receptionist reaching `/app/settings` gets an explanation, not a blank page or a wall of 403s.
- [ ] **Step 5:** Tests per section, add `/app/settings` to the a11y sweep and to `e2e/screens.ts`, commit — `feat: the settings screen the README promised`

---

### Task 17: Reconcile and ship

- [ ] **Step 1: Documents.** README: update the screen count by counting, not assuming; remove Settings from "what this deliberately does not do" only if Phase D shipped; record that the admin API gained writes. MASTER.md: confirm every token in `app.css` matches §2 exactly. Design doc: add a W11 section recording the identity change and *why* — the hue-budget argument is the part worth keeping.
- [ ] **Step 2: Every gate, separately.**

```bash
pnpm lint; echo "lint exit=$?"
pnpm turbo run typecheck --force; echo "typecheck exit=$?"
pnpm turbo run test --force; echo "test exit=$?"
pnpm --filter @dentalops/web verify:contrast; echo "contrast exit=$?"
pnpm turbo run build --force; echo "build exit=$?"
pnpm --filter @dentalops/api build; echo "api build exit=$?"
pnpm --filter @dentalops/web e2e; echo "e2e exit=$?"
```

- [ ] **Step 3: The final visual review.** Regenerate every baseline and page through all of them, both themes, four widths. This is the deliverable, and it is the last chance to see the redesign as a whole rather than as twelve commits.
- [ ] **Step 4: Push, watch CI, then check production.** After Render redeploys, load the live site on a real phone in both themes. Report what you saw; do not claim it works without having looked.

---

## Exit criteria

1. Every screen renders in ink-on-porcelain with Plus Jakarta Sans actually loaded — verified by the font test, not by eye.
2. `verify:contrast` passes all 92 pairs and is wired into the `test` task CI runs.
3. Screenshot baselines exist and are approved for nine screens × 4 widths × 2 themes, and the suite passes at `maxDiffPixels: 0` across a re-seed. `activity` is deliberately excluded — see `e2e/screens.ts` for why.
4. `e2e/a11y.spec.ts` green at 390px and 1440px with no serious or critical violations.
5. All four existing e2e specs green: public booking, drag-reschedule, roster violation, a11y.
6. Lighthouse mobile on `/book/demo-clinic` at **performance ≥ 93 and accessibility 100**, and **CLS under 0.1**. The performance floor is 93, not the 95 recorded in Task 1: that measurement was taken while the webfont silently failed to load, so it was never a number a page rendering its intended typeface could match. Task 3 measured 93 / 94 / 94 with the font actually loading, and CLS unmoved at 0.088. Accessibility and CLS are unchanged floors and are not negotiable.
7. The theme toggle is reachable from public pages, shows which theme is active, and has a system option that follows the OS.
8. The timeline's drag, resize, keyboard navigation and realtime behaviour are unchanged — proven by the existing specs, not by inspection.
9. Either Phase D shipped and an owner can edit their clinic, branches, services, chairs and staff from the browser — or Phase D was deferred, `/app/settings` still says so honestly, and the README still lists it as a gap.
