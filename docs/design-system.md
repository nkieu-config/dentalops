# DentalOps Design System

Source of truth for all UI work.
Implements the UX decisions from the product design spec, which is kept outside the repository.

Stack: React 19 + Tailwind CSS v4 + shadcn/ui. Light and dark are both first-class.

---

## 1. The one design problem that drives everything

A scheduler shows **8 columns of colored blocks at once**. If the brand color is loud, or if appointment cards use full-saturation fills, the timeline becomes a rainbow and nothing is scannable. Every token below follows from one rule:

> **Chrome is quiet. Data carries the color. Status is reserved.**

- **Brand primary** appears only on chrome: buttons, active nav, links, focus rings. Never on an appointment card — enforced by the `--hue0-border` / `--primary` pair in the verifier, which exists because hue 0 was byte-identical to the primary until §3 moved it.
- **Appointment cards** use a low-saturation tinted surface with a saturated 3px left border. The border carries the hue; the fill stays readable.
- **Semantic status colors** (red / amber / emerald) are reserved for meaning and never used decoratively — so when red appears, it always means a violation or conflict.
- **Off-shift regions** are neutral hatch only. They must recede, never compete.

### Correction made in W8 — brand teal darkened one stop

`--primary` shipped as teal-600 `#0D9488` from W4 until W8. Automated axe scanning found white text
on it measures **3.74:1**, below the 4.5:1 AA threshold for normal-size text — which meant every
primary button and every icon-only chrome control was failing, not just one screen. It is now
teal-700 `#0F766E` (**5.47:1** with white). `--ring` moved with it, which also makes the focus ring
more visible. Dark mode was already fine (`#042F2E` on `#2DD4BF` = 7.77:1) and is unchanged.

The lesson worth keeping: §7's checklist claimed this was verified, and it was not. A checklist item
that no machine checks is a statement of intent.

### Identity change in W11 — the brand stopped spending a hue

Teal was a good chrome colour, but it was still a *hue*, and §1's own logic says hue is the scarcest
resource on this product. Three hues are locked to status and six are spent on services; teal was the
tenth. W11 resolves that by giving the brand **no hue at all**: primary is ink `#1C1917` on a warm
porcelain ground `#FAF9F7`, and every hue on screen therefore belongs to the data.

The neutral moved from **slate to stone** at the same time. Slate is blue-biased, which put the chrome
in quiet competition with sky and indigo — the two most-used service hues. Stone biases warm, so chrome
and data now sit on opposite sides of the colour wheel and separate without either raising its voice.

**Where the warmth comes from, since it no longer comes from a brand colour:** the stone neutrals, a
rounder typeface, a larger corner radius, softer shadows, spring motion, and illustrated empty states.
That is a deliberate trade — the personality moved from the palette into the shapes and the motion,
which is the same trade Cal.com and Linear make.

**Teal survives as `--decorative`**, used only where nothing is being reported: empty-state art, the logo
mark, marketing accents on the public pages. It never touches a button, a status, or an appointment card.

| Considered for the accent | Rejected because |
|---|---|
| Rose `#E11D48` | Sits in the same hue family as `--destructive`. §3's guarantee is that *red always means a violation*; a rose illustration a few hundred pixels from a red conflict ring quietly breaks that promise. |
| Violet `#7C3AED` | Already spent — it is data hue 2, and reassigning it would force a `colorIndex` migration on seeded services. |
| Amber, emerald | Locked to warning and success. |
| **Teal `#0F766E`** | **Chosen.** The only hue not spoken for once it vacated chrome, and it keeps a thread back to the old identity. |

### Identity now — "sea glass" (`3eb20d3`), which superseded the ink-on-porcelain identity above

**The two sections above are history, not the current palette.** Ink-on-porcelain shipped in `17a218d`
and was replaced three commits later by `3eb20d3 feat(web): establish sea glass tokens`. Primary is a
desaturated teal again — `#237C78` light, `#7FC4B9` dark — on a cool near-white ground `#F8FBFA`, and the
stone neutrals went with it: every neutral is now green-biased rather than warm.

**The rationale was never recorded.** `3eb20d3` carries a one-line message and no design note, so the
argument that overturned "the brand stopped spending a hue" is not written down anywhere. That argument
is worth reconstructing before the next identity change, because the W11 reasoning above is still on the
page and still reads as current if you stop at the previous heading.

What did survive the change: chrome is still quiet relative to data, status hues are still reserved, and
the personality still comes from shape and motion rather than from saturation.

### Deliberate deviations from the ui-ux-pro-max recommendation

| Tool suggested | We use | Why |
|---|---|---|
| Fira Code (heading) + Fira Sans | **Plus Jakarta Sans** everywhere | A monospace heading reads "developer tool" on the staff app and "unfinished" on the patient booking page. Plus Jakarta Sans is a single variable file with genuine tabular figures, and its rounder terminals supply the friendliness the ink palette deliberately gives up. |
| Primary `#2563EB` (calendar blue) | **Sea-glass teal `#237C78`** | Blue is the most useful hue for categorical appointment data — spending it on chrome would cost *two* data hues and leave no good sixth. Teal costs one, and W11's attempt to spend none (ink) was reverted by `3eb20d3`. |
| Soft UI Evolution's shadow-led depth | **Borders separate, shadows float** | Kept from W4. Inside the grid only two shadows exist — hover and drag — and both are named tokens; the rest of the scale applies only to surfaces that genuinely float above the page. |

---

## 2. Tokens

**`apps/web/src/app.css` is the source of truth for token values. This section documents the rules the
stylesheet cannot state, not the values it already holds.** An earlier revision of this document carried
a full paste-in CSS block; by the time anyone checked, 56 of its 57 light-mode declarations disagreed
with the shipped stylesheet, and the block was the only place a reader would have looked. Duplicating a
stylesheet in prose guarantees exactly one thing, which is that the prose goes stale. It is gone.

To read the current values, open `app.css`: `:root` for light, `.dark` for dark, `@theme inline` for the
Tailwind bindings that turn `--surface-band` into the `bg-surface-band` utility.

### Rules that hold regardless of the values

- **Every token pair is verified by script, never by eye.** `apps/web/scripts/verify-contrast.mjs` walks
  the stylesheet and fails the build on any pair below its minimum. Add a token, add its pair — a colour
  that no pair names is a colour nobody is checking.
- **Text minimums are WCAG's:** 4.5:1 for body, 3:1 for non-text (borders, focus rings, hue stripes).
- **Two surfaces that meet must be told apart.** `SURFACE_SEPARATION` is 1.05. This rule exists because a
  section band shipped at **1.026** against the page ground — technically a different colour, visually a
  single flat sheet — and nothing in the verifier had an opinion about it, since every rule it knew was a
  *minimum for legibility* and none was a *floor for distinguishability*.
- **A surface token is tuned for the ground it actually sits on.** `--surface-subtle` reads 1.069 against
  `--card` and 1.026 against `--background`. That is not a defect: 29 of its 30 usages are inset panels
  inside cards, which is the pair the verifier checks. Full-width page bands are a different job and use
  `--surface-band`, whose pair is checked against `--background`.
- **A primary-tinted surface cannot carry `--muted-foreground`.** `--spotlight` is the patient detail
  page's "next appointment" highlight — a primary tint over `--background`, checked narrowly like
  `--surface-subtle`/`--surface-band` rather than swept into the general `SURFACES` list. It was nearly
  added to that list, which immediately failed: `--muted-foreground` and `--primary` sit at almost the same
  luminance in light mode, so any tint dark enough to separate from `--background` and from a `--secondary`
  badge sitting on it pulls muted text below 4.5:1 — there is no single alpha that satisfies both. The fix
  was the component, not the token: `NextAppointmentSpotlight` uses `--foreground` throughout, and only
  `--foreground`/`--spotlight` is a checked pair, matching what the component actually does rather than
  every combination it theoretically could.
- **Separation is required where a border cannot do the work.** A sticky surface has content scrolling
  underneath it and needs its own fill step — `--timeline-header` is checked against `--timeline-canvas`
  for exactly that reason, and was de-aliased from `--surface-subtle` to get one in light mode. A static
  bordered band does not: the time gutter and the canvas sit at 1.041 with a hairline between them and
  are not a checked pair, because nothing ever passes under the gutter.
- **The verifier resolves `var()` chains before comparing.** It used to keep only literal hex, which
  silently skipped all six `--timeline-*` surface aliases — so the densest screen in the product had zero
  contrast coverage while the report still said every pair passed. A gate that cannot see a token is
  indistinguishable from no gate.
- **The inverted surface is `--surface-inverse`, and it is dark in both themes.** It closes long public
  pages. Light-theme `--ring` measures 2.67:1 on it — below the 3:1 floor — so controls on that surface
  ring with `--surface-inverse-foreground` and offset against `--surface-inverse`, not the page defaults.
- **"Closes the page" is a stronger claim than `SURFACE_SEPARATION` can make, so it has its own floor.**
  The dark-theme footer shipped at `#121615`, which is **1.093** against `--background` — comfortably past
  1.05, and therefore green in the verifier, while reading on screen as no footer at all. The threshold was
  answering *are these two colours distinguishable*, and the design rule is *does this surface invert*. Those
  are different questions, and only the first had a number. `SURFACE_INVERSION` is now 1.15 and the footer
  is `#040706`, which measures **1.212**; light mode is unchanged at 15.288. Note the ceiling this exposes:
  the darkest possible footer, pure `#000000`, only reaches 1.259 against the dark ground, so a dark theme
  cannot buy inversion the way a light one can — 1.15 is most of the headroom that exists, not a soft target.
- **A hairline on the inverted surface needs its own token.** `--border` is themed for the page grounds and
  is wrong on a surface that stays dark in both themes; the footer's rule was first written as
  `border-surface-inverse-foreground/20`, which is exactly the ad-hoc alpha this section exists to prevent —
  no pair names it, so nothing checks it. `--surface-inverse-border` is checked against `--surface-inverse`
  at `SURFACE_SEPARATION` and measures 1.464 light / 1.496 dark.
- **A tint is only band-safe if some pair says so.** `--decorative-surface` against `--surface-band` is
  **1.028** in light mode — below the floor — and the landing page's capability grid was filling half its
  cards with exactly that, with `border-transparent` so no hairline compensated. It passed CI because the
  verifier checked `--decorative-surface` against its own ink and `--decorative` against `--background`, but
  never the tint against the band it was actually sitting on. The pair a component creates is the pair that
  has to be named: `--decorative-surface`/`--background` (1.062) and `--card`/`--surface-band` (1.136) are
  both checked now, and `--decorative-surface` is not to be used as a fill on `--surface-band`.

### Token families

| Family | Holds |
|---|---|
| Ground | `--background`, `--card`, `--popover`, `--surface-subtle`, `--surface-band`, `--spotlight`, `--surface-inverse`, `--surface-inverse-border` |
| Ink | `--foreground`, `--muted-foreground`, `--appointment-muted`, `--surface-inverse-foreground` |
| Chrome | `--primary`, `--secondary`, `--accent`, `--border`, `--input`, `--ring`, `--selection` |
| Status | `--destructive`, `--warning`, `--success`, each with `-foreground` / `-surface` / `-on-surface` |
| Non-reporting accent | `--decorative`, `--warm`, each with `-surface` / `-on-surface` |
| Grid | `--grid-line`, `--grid-line-hour`, `--offshift`, `--now-line`, and the `--timeline-*` aliases |
| Data | `--hue0`…`--hue5`, each `-bg` / `-border` (see §3) |

Status, decorative and warm all carry an `-on-surface` ink because their `-surface` tints are too light to
take `--foreground` at 4.5:1. Reach for `-on-surface` whenever you use the matching `-surface`.


`cv11` was an Inter character variant and does nothing in Plus Jakarta Sans; it was dropped rather than
carried over as decoration. `tnum` stays and is the load-bearing one — it was verified present in the
Plus Jakarta Sans variable file with `fontTools` before the family was adopted, not assumed.

### The focus ring's offset must be themed, and a `:root` variable will not do it

With the primary button now *ink*, an ink ring drawn on an ink button is 1.00:1 — invisible. The gap that
`ring-offset-2` opens is the only thing making it legible, and Tailwind's default offset colour is hard
white, which paints a white halo around a focused control on a dark surface.

The fix is the utility, not a variable. Tailwind v4 registers `--tw-ring-offset-color` with
`@property { inherits: false; initial-value: #fff }`, so **setting it on `:root` does not cascade** — the
obvious-looking fix silently does nothing. `Button` therefore carries
`focus-visible:ring-offset-2 focus-visible:ring-offset-background`, which resolves through
`--color-background` and follows the theme.

There is deliberately no separate `--ring-offset` token. It would equal `--background` in both themes and
no stylesheet would read it, and this project has already been bitten once by a declaration that looked
authoritative and was never consulted. The verifier checks `--ring` against `--background` and `--card`
instead, which is the property that actually has to hold.

### Time grid scale (project-specific — the most important spacing decision)

| Token | Value | Meaning |
|---|---|---|
| `--spacing-slot` | `1rem` (16px) | one 15-minute slot at default zoom |
| `--spacing-hour` | `4rem` (64px) | 4 slots — a working day (08:00–20:00) is 768px tall |
| `--spacing-timegutter` | `3.5rem` (56px) | sticky left time axis |
| `--spacing-col-min` | `11rem` (176px) | minimum dentist column; below this a name truncates badly |

Zoom levels for W5: `compact` 12px/slot, `default` 16px/slot, `roomy` 24px/slot. Only this one variable changes — all layout math derives from it.

### Typography scale

Single family: **Plus Jakarta Sans** (variable, `wght 200..800`), self-hosted from
`@fontsource-variable/plus-jakarta-sans`. No Google Fonts network call.

> **The family name must be `"Plus Jakarta Sans Variable"`, not `"Plus Jakarta Sans"`.** Fontsource
> registers variable faces under a `… Variable` family name. W4 through W10 shipped
> `--font-sans: "Inter", …` against a package that registers `'Inter Variable'`, so the declared family
> never matched, the downloaded font was never used, and every visitor without Inter installed locally
> saw `system-ui` instead. The bundle paid for a font it did not render. Verify the name against the
> package's own `index.css` whenever the family changes — this is a silent failure with no console error.

Sizes are `@utility type-*` classes in `app.css`, not raw Tailwind sizes. Always reach for the role, never
for `text-sm` — the role is what a later scale change can move.

| Utility | Size / line-height | Role |
|---|---|---|
| `type-display-lg` | `3rem / 3.5rem` | Public hero h1 at `lg` and up |
| `type-display` | `2.25rem / 2.75rem` | Public hero h1 below `lg` |
| `type-page-title` | `1.5rem / 2rem` | Staff page h1 |
| `type-section-title` | `1.25rem / 1.75rem` | Section h2 |
| `type-subsection-title` | `1.125rem / 1.625rem` | Subsection h3, hero sub-headline |
| `type-dialog-title` | `1.125rem / 1.625rem` | Dialog and sheet titles |
| `type-card-title` | `1rem / 1.5rem` | Card and list-row titles |
| `type-body` | `1rem / 1.5rem` | Public-page running text |
| `type-ui` | `0.875rem / 1.25rem` | Staff app default — set on `body` |
| `type-supporting` | `0.875rem / 1.25rem` | Secondary prose under a title |
| `type-meta` | `0.75rem / 1rem` | Labels, captions, footer |
| `type-dense` | `0.75rem / 1rem` | Inside the grid, where rows are 16px tall |

Rules: staff app body is 14px (`type-ui`, set on `body`) for density; **public booking body is never below
16px** (`type-body` — iOS auto-zooms on focus below that). Any element rendering a time, duration, count, or
price gets `tabular-nums` — non-negotiable, it prevents column jitter. Display sizes carry `tracking-tight`;
at 48px that is about −1.2px, which is the tracking the geometric display face needs to stop looking loose.

**Thai now has its own webfont, which reverses an earlier decision recorded here.** `main.tsx` imports both
`@fontsource-variable/plus-jakarta-sans` and `@fontsource-variable/noto-sans-thai`, and `--font-sans` stacks
them in that order, so Latin resolves to Plus Jakarta Sans and Thai — which Plus Jakarta Sans does not cover
— resolves to Noto Sans Thai rather than falling through to `system-ui`. This document previously argued the
opposite ("Thai renders in the system face, by design… adding a Thai webfont would cost bundle weight for
content that is incidental"). **The argument that overturned it was not recorded**, so the cost it accepted —
a second variable font in the bundle — is currently unjustified in writing. Both families are self-hosted;
there is still no Google Fonts network call.

`apps/web/src/lib/font.test.ts` asserts that `--font-sans` names, in order, the family each imported
fontsource package actually registers. That test is why the stack cannot silently drift the way the Inter
stack did through W4–W10.

### Radius, elevation, motion

- **Radius:** the single `--radius` scale is gone; radii are now named for what they wrap, so a control
  and a card can move independently. `--radius-control` `0.5rem` (buttons, inputs, chips) ·
  `--radius-card` `0.875rem` (cards, dialogs, sheets) · `--radius-hero` `1.375rem` (every floating workspace
  surface: sidebar, rail, header, page toolbars, and the public hero artifact) · `--radius-timeline-shell` `1rem` · `--radius-timeline-header` `0.75rem` ·
  `--radius-timeline-appointment` `0.25rem`. Full-round only for avatars, status dots, and the
  active-nav pill. These named tokens govern anything that *is* a surface — a card, a sheet, a control, a
  page shell. Ornaments nested inside one (a swatch, a chip in a record row, a preview thumbnail) may use
  stock `rounded-sm` / `rounded-md`; they are not surfaces and do not need to move when a surface does.
  Reach for a named token the moment the thing has its own border or background and sits directly on the
  page. **A skeleton is the exception among ornaments**: its whole job is to stand in for the control that
  replaces it, so it takes `--radius-control`. It shipped at `rounded-md` until W12, which put a 6px
  placeholder where an 8px input was about to appear. The appointment radius is the one number here that is not a taste call: `durationMin`
  admits 15 (`packages/contracts/src/directory.ts`), a 15-minute block renders at the 16px floor
  `AppointmentCard` clamps to, and this token had drifted to `0.625rem` — 10px of rounding on a 16px
  block is 62% of its height, which is the "eats the block" case the rule was written to prevent. Even
  the shortest service in the default catalogue (Ortho, 30 min → 32px) was spending a third of its
  height per corner.
- **Elevation:** data-dense means **borders separate, shadows float**. Five levels, no others:
  - `shadow-none` — everything resting in the grid, all cards, all table rows
  - `shadow-xs` — resting buttons and inputs only; a 1px hairline of depth, not a visible shadow
  - `--shadow-appointment-hover` — an appointment card under the pointer. Added when the Timeline
    redesign asked hover to read as "reachable" without moving the card; the earlier rule allowed no
    shadow inside the grid except on drag, and the code had already followed the newer rule with an
    inline arbitrary value that no token named and no verifier could see. It is a token now, and it is
    deliberately lighter than `shadow-md` — dozens of cards share one screen and this fires on one.
  - `shadow-md` — popover, dropdown, drawer, dialog
  - `shadow-lg` — the card currently being dragged, which is the only shadow that means "lifted off the grid"
- **Motion:** 150ms micro-interactions, 200ms drawer/dialog, exit at ~70% of enter. `transform`/`opacity`
  only. Press feedback is `scale(0.97)` on buttons and tappable cards. List and grid entrances stagger
  30–50ms per item. Realtime arrival = 250ms fade + one subtle scale pulse `0.98 → 1`. Spring easing
  (`cubic-bezier(0.34, 1.24, 0.64, 1)`) on anything that *enters*; plain ease-out on anything that
  merely changes state. Reduced-motion is handled globally in the CSS above and is not optional.

---

## 3. Data color scale (appointment cards)

Six hues, held as `--hue0`…`--hue5` with a `-bg` fill and a `-border` stripe each. The sea-glass rework
desaturated all six so they sit under the new ground instead of on top of the old one.

| Index | Reads as | Light: bg / border | Dark: bg / border |
|---|---|---|---|
| 0 | teal | `#DDF3EE` / `#1B5F5B` | `#1C4943` / `#9BE3D6` |
| 1 | violet | `#EEE8F8` / `#8066AE` | `#3C3554` / `#C2B1E6` |
| 2 | blue | `#E4F0F8` / `#397A9E` | `#294352` / `#8EC4E3` |
| 3 | gold | `#FFF3D5` / `#9E7014` | `#4A3C20` / `#E8C56B` |
| 4 | rose | `#F9E6EC` / `#A85470` | `#4A303A` / `#E7A8B9` |
| 5 | green | `#E7F0DD` / `#527A40` | `#33452C` / `#A6C98F` |

Assignment: hue is derived from `service.colorIndex` (stored, not hashed at render — stable across sessions), resolved by `apps/web/src/lib/appointment-hue.ts`. Card text is always `--card-foreground`, never the hue. Indices are 0-based in code; this table is too.

**Hue 0 was byte-identical to `--primary` and has been moved off it.** §1 promises the brand colour never
lands on an appointment card, and by construction it did — for `Cleaning`, which is `DEFAULT_SERVICES[0]`
and the most frequent card on a dental schedule. Hue 0 now sits a clear luminance step away from chrome in
both themes, in the direction of its own card fill: darker in light, brighter in dark, so the data reads
louder than the chrome exactly as §1 asks. `["--hue0-border", "--primary", HUE_OFF_CHROME]` holds it there.

> **Still open — hues 3 and 4 sit near reserved status colours.** Gold `#9E7014` is in `--warning`'s
> family and rose `#A85470` in `--destructive`'s, while §1 promises those colours only ever mean status.
> Nothing is broken: both pass contrast, and the desaturation keeps them well clear of the saturated
> status tones. But `HUE_OFF_CHROME` only compares luminance, and two colours can be a full hue apart at
> identical lightness, so no check can currently express this one. It needs a decision, not a threshold.

### Status is expressed by treatment, not by hue

| Status | Treatment |
|---|---|
| `confirmed` | normal card |
| `completed` | 70% opacity + ✓ icon top-right |
| `no_show` | amber `--warning` left border overrides service hue + ⚠ icon |
| `cancelled` | `--muted` fill, strikethrough title, no service hue |
| conflict / violation | `--destructive` 2px ring + ⚠ icon **and** text in the violations panel |
| held (public, transient) | dashed border, 50% opacity, countdown chip |

Per `color-not-only`: every status carries an icon or text label as well as color. This is checked in the a11y pass.

---

## 4. Breakpoint map

Breakpoints are Tailwind defaults: `sm 640 / md 768 / lg 1024 / xl 1280`. Reference widths for testing: **375, 768, 1024, 1440**.

### App shell (staff)

| Range | Navigation | Topbar |
|---|---|---|
| `< 768` | bottom nav, up to 5 items, 56px, labels + icons | clinic identity + account only |
| `768–1023` | left icon rail, 72px wide (`--spacing-navrail`), tooltips on hover | clinic identity, demo state, theme, account |
| `≥ 1024` | left sidebar 224px (`--spacing-sidebar`), always expanded | same, with account name and role |

### Per screen

| Screen | `< 768` | `768–1023` | `≥ 1024` |
|---|---|---|---|
| **Timeline** | single dentist (segmented switch) **or** agenda list; **no drag** — tap → drawer → "Move" → slot picker | 2–3 columns, horizontal scroll-snap, sticky time gutter, column picker; drag enabled | all columns (virtualize > 10 dentists); full drag / resize / keyboard |
| **Booking wizard** | full-bleed single column, sticky footer CTA | same, `max-w-md` centered | same, `max-w-xl` centered — no sidebar |
| **Roster editor** | per-staff day list; add/edit via drawer | 3-day window, scroll-snap (through `1279`) | `≥ 1280` only: full week grid + violations panel docked right (320px) |
| **Settings / Patients** | stacked cards | 2-col form grid | 2-col + `max-w-4xl` |

The topbar carries only what is true on every screen — clinic identity, demo state, theme, account. Anything
scoped to one screen (branch, date, view, search) belongs to that screen's own command surface, so Timeline and
Roster each own their branch and date controls rather than sharing a global one.

Roster is the one screen whose mode boundary is not `lg`. Its full week needs `--spacing-rostername` plus seven
`--spacing-rosterday` columns — 1016px — which does not fit beside the 224px sidebar until the viewport reaches
`1280`. Below that it shows a 3-day window and moves the review queue into a bottom sheet.

The booking wizard and the manage-booking page are patient-facing and deliberately stay a single centred
column at every width — patients book from phones, and a desktop sidebar would be chrome nobody asked for.
They also carry their own clinic-branded header rather than `PublicNav`: that nav sells "Create a clinic" and
"Sign in", which are for clinic owners, not for a patient halfway through booking. Public controls run one
step larger than the staff app — reach for `<Button size="lg">` rather than overriding type per call site.

**Hard rules at every width:** no horizontal scroll on `body` (scroll lives inside the grid container only); touch targets ≥ 44px; the timeline is the *only* element allowed its own horizontal scroll.

---

## 5. Wireframes

### 5.1 Timeline — `≥ 1024`

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ☰  DentalOps    ⌄ Sukhumvit    ‹  Fri 31 Jul 2026  ›   [Today]  ⌕  ◐  (A) │ 56
├──────┬─────────────────────────────────────────────────────────────────────┤
│      │        Dr.Anong    Dr.Somchai   Dr.Ploy     Dr.Nid      Dr.Kiat     │ sticky
│ ▦ Ti │ ─────────────────────────────────────────────────────────────────── │ header
│ ▤ Ro │ 08:00 ░░░░░░░░░░   ┃Cleaning   ░░░░░░░░░░   ┃Whitening  ░░░░░░░░░░ │
│ ⌾ Pa │       ░ off-shift  ┃S. Chaiwat  ░           ┃N. Meesuk  ░          │
│ ⚙ Se │ 09:00 ┃Ortho ⟳     ┃───────────  ┃Filling   ┃──────────  ░         │
│      │       ┃P. Wongsa   │             ┃K. Tanaka │            ░         │
│ ────  │ 10:00 ┃──────────  ┃Root Canal  ┃───────── ┃Consult ✓   ┃Extract  │
│ ‹‹   │ ══════════════════════════ now ══════════════════════════════════  │ ← now
│      │ 11:00               ┃           ░░░ lunch ░░░           ┃─────────  │
│      │ 12:00 ░░░░░░░░░░░░░░░░░░░░ lunch ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│      │ 13:00 ┃Cleaning     ┃Implant ⚠   ┃Cleaning  ┃           ┃Checkup   │
│      │       ┃  no-show    ┃  conflict  ┃          ┃           ┃          │
└──────┴─────────────────────────────────────────────────────────────────────┘
 240px   time gutter 56px │ columns min 176px, 15min = 16px, 1h = 64px

┃ = 3px service-hue left border   ░ = off-shift neutral hatch
⟳ recurring   ✓ completed   ⚠ conflict (destructive ring)
```

Interactions: drag on empty space → create (drawer opens pre-filled) · drag card → move (optimistic; 409 → snap back + toast naming the conflict) · drag bottom edge → resize · click → drawer · `Tab`/arrows move focus between cards, `Enter` opens drawer, `Shift+arrows` nudge by one slot.

### 5.2 Timeline — `< 768` (agenda mode, no drag)

```
┌──────────────────────────┐
│ ‹ Fri 31 Jul ›   ⌕  ◐    │ 56
├──────────────────────────┤
│ [ All ▾ ] [Dr.Anong ▾]   │ filters
├──────────────────────────┤
│ ┃ 09:00–10:00      ⟳     │
│ ┃ Ortho adjustment       │  ← 44px+ tap target
│ ┃ P. Wongsakorn          │
├──────────────────────────┤
│ ┃ 10:00–11:30            │
│ ┃ Root canal             │
│ ┃ S. Chaiwat  · Dr.Somchai│
├──────────────────────────┤
│ ══════ now 10:42 ══════  │
├──────────────────────────┤
│ ┃ 13:00–13:45        ⚠   │
│ ┃ Implant consult        │
│ ┃ conflict — tap to fix  │
└──────────────────────────┘
│ ▦ Timeline ▤ Roster ⌾ ⚙ │ 56 bottom nav
└──────────────────────────┘
```

Tapping a card opens the drawer; "Move" inside the drawer opens the same `SlotPicker` component the public wizard uses.

### 5.3 Booking wizard — `< 768` (mobile-first, the default)

```
┌──────────────────────────┐   ┌──────────────────────────┐
│ ← ยิ้มสวยทันตคลินิก        │   │ ← Choose a time          │
│ ●───●───○───○   Step 2/4 │   │ ●───●───●───○   Step 3/4 │
├──────────────────────────┤   ├──────────────────────────┤
│ Choose a dentist         │   │ ‹  Tue 4 Aug 2026  ›     │
│                          │   │  M  T  W  T  F  S  S     │
│ ┌──────────────────────┐ │   │  3 [4] 5  6  7  8  9     │
│ │ (A) Dr. Anong    ›   │ │   ├──────────────────────────┤
│ │     General, Ortho   │ │   │ Morning                  │
│ └──────────────────────┘ │   │ [09:00][09:30][10:00]    │
│ ┌──────────────────────┐ │   │ [10:30][ 11:00 ]         │
│ │ (S) Dr. Somchai  ›   │ │   │ Afternoon                │
│ │     Surgery          │ │   │ [13:00][13:30][14:00]    │
│ └──────────────────────┘ │   │ [14:30][15:00][15:30]    │
│ ┌──────────────────────┐ │   │                          │
│ │ ⚡ Any available  ›   │ │   │  ⓘ 16 slots available    │
│ │    Soonest booking   │ │   │                          │
│ └──────────────────────┘ │   │                          │
├──────────────────────────┤   ├──────────────────────────┤
│      [ Continue ]        │   │      [ Continue ]        │ sticky footer
└──────────────────────────┘   └──────────────────────────┘

After a slot is tapped → hold created → banner pins under the step bar:

┌──────────────────────────┐
│ ⏱ Holding 10:30 for 4:52 │  ← --warning tint, tabular-nums,
└──────────────────────────┘     counts down from server expiresAt

Expired state replaces the grid, never a silent failure:
┌──────────────────────────┐
│      ⏱                   │
│  Your hold expired       │
│  10:30 was taken.        │
│  Nearest free: 10:45     │
│  [ Pick another time ]   │
└──────────────────────────┘
```

Slot buttons: 44px min height, `tabular-nums`, disabled slots omitted rather than greyed (a grid of greyed slots reads as broken). Desktop is the same column at `max-w-md`, centered.

#### Deliberate deviations from this wireframe

| Wireframe says | We ship | Why |
|---|---|---|
| Named dentists first, **⚡ Any available** last | **⚡ Any available first**, named dentists below it | The wireframe orders by specificity; the wizard orders by intent. A walk-in booking a cleaning has no dentist in mind — "any available" is both the fastest path to a slot and the most common choice, so it goes where the thumb already is. Patients who *do* want Dr. Anong are looking for a name and will scan past one card to find it, which is a cheaper cost than making the majority scroll a roster to reach the option they wanted. |

### 5.4 Roster editor — `≥ 1024`

```
┌──────────────────────────────────────────────────────┬──────────────────┐
│ ‹  Week of 3–9 Aug 2026  ›   ⌄ Sukhumvit  [+ Shift]  │  Validation      │
├────────────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┤                  │
│            │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │ Sun │  🔴 Blocking (1) │
├────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤  ┌─────────────┐ │
│ Dr. Anong  │▓▓▓▓▓│▓▓▓▓▓│     │▓▓▓▓▓│▓▓▓▓▓│▓▓▓⟳ │     │  │ 3 appts now │ │
│            │ 9–17│ 9–17│     │ 9–17│ 9–17│ 9–13│     │  │ outside     │ │
├────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤  │ Dr.Ploy Wed │ │
│ Dr. Somchai│     │▓▓▓▓▓│▓▓▓▓▓│     │▓▓▓▓▓│     │     │  │ 14:00 →     │ │
├────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤  └─────────────┘ │
│ Dr. Ploy   │▓▓▓▓▓│     │▒▒▒▒▒│▓▓▓▓▓│     │     │     │                  │
│            │13–20│     │13–17│13–20│     │     │     │  🟡 Warnings (2) │
├────────────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤  • Dr.Anong 51h  │
│ Dr. Nid    │▓▓▓▓▓│▓▓▓▓▓│▓▓▓▓▓│     │     │▓▓▓▓▓│     │    (max 48)      │
└────────────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┤  • Dr.Nid 9h rest│
                                                        │    (min 11h)     │
▓ saved shift   ▒ dragging (live-validating)   ⟳ recurring                 │
                                                        │ [Discard] [Save] │
                                                        └──────────────────┘
```

While dragging, `POST /roster/validate` fires debounced (250ms) and the panel updates live. Blocking violations disable **Save** and each links to the affected appointments on the timeline. On `< 768` the grid becomes a per-staff list and violations become a sticky bottom sheet.

---

## 6. Component inventory (layer 3 of the hierarchy)

`/dev/ui` shows **every component in `components/ui` and `components/shell`**, every colour token, and the composites below. Until W12 it showed the composites and roughly half the primitives — no shell chrome at all, seven kit components missing, and 10 of 54 tokens — while closing with the line *"Every component in MASTER §6 is on this page — nothing outstanding."* That sentence was true of the table below and read as a claim about the system, and a test asserted it, which gave it authority it had not earned.

Two things keep it honest now. `dev-ui-page.test.tsx` walks `components/{ui,shell}` on disk and fails if any file is not imported by the page, with a short exemption list for providers and non-visual helpers; and the page states its own limit — it shows components, not screens, because screens are compositions the visual suite already covers at four widths in both themes.

The gallery earns its keep as a *finder*, not a catalogue. Rendering all 54 tokens is what surfaced `--warm-*`: four values in each theme, three pairs in the contrast gate, and zero consumers anywhere in the app. It is deleted. The shell section points its first nav item at `/dev/ui` itself, so the current-destination pill on the page is the real one rather than a copy that can drift — the same reason the offline section mounts the shell's own banner.

`/dev/ui` is built into `pnpm dev` and into the Playwright build (`VITE_DEV_UI=1`), and is absent from a plain production build.

The composites, each with every state rendered:

| Component | States to render in the gallery |
|---|---|
| `AppointmentCard` | 6 hues × {confirmed, completed, no_show, cancelled, conflict, held, dragging, focused} |
| `TimeGrid` | 3 zoom levels × {empty, off-shift, now-line, overlapping cards, 1000-card perf case} |
| `SlotPicker` | {loading, slots available, none available, hold active, hold expired} |
| `ViolationList` | {clean, warnings only, blocking, mixed} |
| `CountdownBanner` | {>2min, <60s urgent, expired} |
| `ShiftBlock` | {saved, dragging, recurring, conflicting} |
| `EmptyState` / `StatusCallout` | {no data, 409 conflict, 5xx, offline} |

### 6.1 Forms — one system, and the two places it is deliberately not used

Every labelled control in the product is a `Field` from `components/ui/form-field.tsx`. `Field` owns the label association, `aria-invalid`, the `aria-describedby` chain (error before hint), and the error's icon-plus-hue treatment; `FormError` owns the form-level box; `SubmitButton` owns the pending label. They lived in `features/auth/auth-form.tsx` until W12, which meant settings, the staff sheet and the **public booking wizard** each reached into the auth feature to get a label — and pulled `AuthCard`, which mounts `PublicNav`, into their chunk graph. Only `AuthCard` and `PasswordStrengthHint` are auth's now.

`useAuthForm` is the validation half: a Zod schema, errors cleared on change, focus moved to the first invalid field by `name`, and API error codes mapped onto fields via `fieldForErrorCode`. Nine forms use it. Two do not, on purpose:

- **`CreateDrawer`** has no validation to run — it disables the submit button and names what is still missing ("Choose a service and patient to continue"), which is better than letting someone submit and be told no.
- **`ShiftDialog`** holds its draft in the roster page, because a draft shift is validated by the server on every keystroke and drawn on the grid while you edit it.

Both still use `Field` and `FormError`, so they look identical to the nine.

**Control scale.** One height for everything you can type in or pick from: `h-11` at every width up to `sm`, `sm:h-10` above it — 44px on touch, 40px on the desktop. `Input` and `AppSelect`'s `field` variant both encode it, so a select and a text input sitting in the same grid row line up. This is the corrected form of a rule that used to be split three ways: `Input` defaulted to `sm:h-9` (36px, matching nothing), an opt-in `publicScale` prop gave the correct 40px under a name that implied it was for public pages only, and eleven call sites bolted `min-h-11` on top to get 44px back. When most call sites override a default, the default is wrong.

**Text scale in controls.** Text you *type* is `type-body` (16px) at every width, because iOS Safari zooms the viewport on focus below 16px and it does that in landscape too. Text you *pick* is `type-ui` (14px), because a select trigger is a button and never takes focus-zoom. That is why an input and a select are the same height but not the same type size.

**Validation is the app's, never the browser's.** Every `<form>` sets `noValidate`. A native constraint bubble is browser-styled, browser-language, and vanishes on blur — it cannot be `role="alert"`, cannot persist, and cannot be tested. The public booking form was the last one missing the attribute, so a patient who mistyped their optional email got a bubble where every staff form gives an inline error.

**Rules that outlive a single form live in `lib/`.** `lib/phone.ts` holds the phone pattern, the normaliser and the message, because the same number used to be judged twice: staff could paste `081 234 5678` and the patient booking themselves could not, with two different error strings for one server rule (`/^0\d{8,9}$/`, in both `CreatePatientDto` and `ConfirmBookingDto`). Both paths now normalise before validating and send the API a clean value.

### 6.2 The control contract

Five rules the kit had never agreed on. `components/ui/control-contract.test.tsx` holds them; `components/ui/focus-ring.ts` holds the two strings they share.

**One height.** `h-11 · sm:h-10 · [@media(pointer:coarse)]:h-11` — 44px on touch at any width, 40px on a mouse. `Button` (default and icon), `Input`, `AppSelect`, the `Sheet` close and the `SegmentedControl` items all encode it, so anything that can share a form row lines up. `size="sm"` is the one deliberate exception: 36px on a mouse for toolbar chips, still bumped to 44px on touch. Before W12 the default was `sm:h-9` and **40 of the app's 116 buttons wrote their own height on top of it — 36 of them `min-h-11`.** When a third of the call sites override a default, the default is wrong; the overrides are gone.

**One focus ring.** `focusRing` — `ring-2` + `ring-ring` + `ring-offset-2` + `ring-offset-background`. Seven of the ten kit components with a ring were missing the offset, so tabbing from an input to the select beside it changed the ring's geometry.

**One way to say disabled.** `disabledControl` — `disabled:cursor-not-allowed disabled:opacity-50`. Note what is *not* there: `disabled:pointer-events-none`, which `Button` carried until W12. Native `disabled` already blocks the click; all `pointer-events-none` added was suppressing hover — and several buttons are disabled *with a `title` that explains why* (`OFFLINE_MESSAGE` on the roster and staff sheets). The explanation could never appear. There is a test for exactly this.

**One radius vocabulary.** Controls take `--radius-control`; see §2. Buttons, chips, `kbd`, skip links, slot buttons and skeletons had drifted onto stock `rounded-md`.

**No alpha on anything that must be read.** `verify-contrast.mjs` resolves tokens, not opacity, so an alpha-tinted colour is invisible to the gate by construction. The calendar's adjacent-month days were `text-muted-foreground/40` — about 1.9:1, and those days are *selectable*, not disabled. Alpha stays legal for hover and open-state decoration on non-text.

---

## 7. Verification checklist (ties to the spec's Definition of Done)

- [x] Contrast ≥ 4.5:1 body / ≥ 3:1 large — enforced by `apps/web/e2e/a11y.spec.ts`, which fails the build on any `serious` or `critical` axe violation at 390px and 1440px. This checklist item was **asserted rather than verified** until W8: the original `--primary` (teal-600 `#0d9488`) gives white text only **3.74:1**, so every primary button in the app was failing AA. Corrected to teal-700 `#0f766e` (**5.47:1**).
- [x] **Every token pair verified by script, not by eye** — W11 added `apps/web/scripts/verify-contrast.mjs`, which reads `app.css` directly and checks **144** pairs across both themes: body text on all five surfaces, every button label, every semantic chip, input borders against WCAG 1.4.11's 3:1, focus ring against its offset, card text plus hue stripes against all six data hues, and every pair of surfaces that meet, against `SURFACE_SEPARATION`. It exits non-zero on any failure and runs in CI. Three real failures were caught and fixed *before* any code changed: `--muted-foreground` at stone-500 fell to 4.36:1 on the muted surface, and `--input` at hairline weight was 1.17:1 where 1.4.11 wants 3:1 in both themes.
- [x] **Surfaces that meet are distinguishable** — the rule the previous line did *not* cover. `--surface-band` shipped at 1.026 against `--background`, which is a different colour by definition and a single flat sheet to a reader; the page's band rhythm existed only in the markup. Caught by comparing our surface steps against a reference system's, not by any check we owned. The gate now owns it.
- [x] **Aliased tokens are checked, not skipped** — the gate above shipped blind to `var()`. Every `--timeline-*` surface is an alias, so the Timeline — the densest screen in the product — had zero coverage while the run still reported that all pairs passed. Resolving aliases immediately surfaced `--timeline-header` at 1.026 against the canvas in light mode (dark was 1.303, so the layering was intended and only light failed to deliver it) and `--hue0-border` at 1.00 against `--primary`. Both are fixed; both are now checked.
- [x] **Font family name asserted** — a unit test reads the resolved `font-family` and fails if it is not the fontsource-registered `… Variable` name. This exists because W4–W10 silently rendered in `system-ui` while shipping an unused Inter file.
- [ ] Visual regression: every screen at 375 / 768 / 1024 / 1440 × light/dark has an approved baseline screenshot
- [ ] No status conveyed by color alone (icon or text always present)
- [ ] Timeline fully keyboard-operable; visible focus ring on every card; drag has a keyboard equivalent
- [ ] Touch targets ≥ 44px at 375px; no `body` horizontal scroll at 375 / 768 / 1024 / 1440
- [ ] `prefers-reduced-motion` honoured (global rule above)
- [ ] All times, durations, counts use `tabular-nums`
- [ ] Icons from Lucide only — one family, consistent stroke; no emoji as icons
- [ ] Public booking body text ≥ 16px
- [ ] Lighthouse mobile ≥ 90 on the public booking page

### Anti-patterns, project-specific

Never: saturated fills on appointment cards · saturated red/amber/emerald for anything but status · shadows inside the grid (except the dragged card) · a card-sized radius on an appointment card · touch drag below 768px · greyed-out unavailable slots · a spinner where a skeleton belongs · `100vh` (use `100dvh`) · a raw Tailwind size where a `type-*` role exists · a colour that no verifier pair names · two surfaces meeting below `SURFACE_SEPARATION`.
