# DentalOps Design System — Master

Source of truth for all UI work. Page-specific deviations live in `docs/design-system/pages/`.
Implements the UX decisions in [../superpowers/specs/dentalops-design.md](../superpowers/specs/dentalops-design.md) §6.

Stack: React 19 + Tailwind CSS v4 + shadcn/ui. Light and dark are both first-class.

---

## 1. The one design problem that drives everything

A scheduler shows **8 columns of colored blocks at once**. If the brand color is loud, or if appointment cards use full-saturation fills, the timeline becomes a rainbow and nothing is scannable. Every token below follows from one rule:

> **Chrome is quiet. Data carries the color. Status is reserved.**

- **Brand primary** appears only on chrome: buttons, active nav, links, focus rings. Never on an appointment card.
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

### Deliberate deviations from the ui-ux-pro-max recommendation

| Tool suggested | We use | Why |
|---|---|---|
| Fira Code (heading) + Fira Sans | **Inter** everywhere | A monospace heading reads "developer tool" on the staff app and "unfinished" on the patient booking page. Inter is the shadcn/ui default (zero fighting with component styles), ships as one variable file, and has real tabular figures — which a scheduler needs more than a display face. |
| Primary `#1E40AF` (saturated blue) | **Teal `#0F766E`** | Blue is the most useful hue for categorical appointment data. Spending it on chrome would force the data palette into worse hues. Teal also carries the medical association the healthcare palettes recommended. |

---

## 2. Tokens

Paste into `apps/web/src/app.css` in W4. Values are Tailwind palette stops, so contrast ratios are already known-good.

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0.375rem;

  --background: #ffffff;
  --foreground: #0f172a;
  --card: #ffffff;
  --card-foreground: #0f172a;
  --popover: #ffffff;
  --popover-foreground: #0f172a;

  --primary: #0f766e;
  --primary-foreground: #ffffff;
  --secondary: #f1f5f9;
  --secondary-foreground: #0f172a;
  --muted: #f8fafc;
  --muted-foreground: #64748b;
  --accent: #f1f5f9;
  --accent-foreground: #0f172a;

  --destructive: #dc2626;
  --destructive-foreground: #ffffff;
  --warning: #b45309;
  --warning-foreground: #ffffff;
  --success: #047857;
  --success-foreground: #ffffff;

  --border: #e2e8f0;
  --input: #e2e8f0;
  --ring: #0f766e;

  --grid-line: #e2e8f0;
  --grid-line-hour: #cbd5e1;
  --offshift: #f1f5f9;
  --offshift-stripe: #e2e8f0;
  --now-line: #dc2626;
}

.dark {
  --background: #020617;
  --foreground: #f8fafc;
  --card: #0f172a;
  --card-foreground: #f8fafc;
  --popover: #0f172a;
  --popover-foreground: #f8fafc;

  --primary: #2dd4bf;
  --primary-foreground: #042f2e;
  --secondary: #1e293b;
  --secondary-foreground: #f8fafc;
  --muted: #0f172a;
  --muted-foreground: #94a3b8;
  --accent: #1e293b;
  --accent-foreground: #f8fafc;

  --destructive: #f87171;
  --destructive-foreground: #450a0a;
  --warning: #fbbf24;
  --warning-foreground: #451a03;
  --success: #34d399;
  --success-foreground: #022c22;

  --border: #1e293b;
  --input: #1e293b;
  --ring: #2dd4bf;

  --grid-line: #1e293b;
  --grid-line-hour: #334155;
  --offshift: #0b1220;
  --offshift-stripe: #1e293b;
  --now-line: #f87171;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --radius-sm: calc(var(--radius) - 2px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);

  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;

  --spacing-slot: 1rem;
  --spacing-hour: 4rem;
  --spacing-timegutter: 3.5rem;
  --spacing-col-min: 11rem;
  --spacing-topbar: 3.5rem;
  --spacing-bottomnav: 3.5rem;
}

html { font-feature-settings: "cv11", "tnum"; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Time grid scale (project-specific — the most important spacing decision)

| Token | Value | Meaning |
|---|---|---|
| `--spacing-slot` | `1rem` (16px) | one 15-minute slot at default zoom |
| `--spacing-hour` | `4rem` (64px) | 4 slots — a working day (08:00–20:00) is 768px tall |
| `--spacing-timegutter` | `3.5rem` (56px) | sticky left time axis |
| `--spacing-col-min` | `11rem` (176px) | minimum dentist column; below this a name truncates badly |

Zoom levels for W5: `compact` 12px/slot, `default` 16px/slot, `roomy` 24px/slot. Only this one variable changes — all layout math derives from it.

### Typography scale

Single family: **Inter** (variable, `wght 100..900`), self-hosted or via Google Fonts with `display=swap`.

| Role | Size / line-height | Weight |
|---|---|---|
| Display (public hero) | `1.875rem / 2.25rem` | 600 |
| H1 page title | `1.5rem / 2rem` | 600 |
| H2 section | `1.125rem / 1.75rem` | 600 |
| Body | `0.875rem / 1.375rem` | 400 |
| Body (public pages) | `1rem / 1.5rem` | 400 |
| Label / table header | `0.75rem / 1rem`, `tracking-wide`, uppercase | 500 |
| Time & numeric | inherit + `tabular-nums` | 500 |

Rules: staff app body is 14px (density); **public booking body is never below 16px** (iOS auto-zoom on focus). Any element rendering a time, duration, count, or price gets `tabular-nums` — non-negotiable, it prevents column jitter.

### Radius, elevation, motion

- **Radius:** `--radius: 0.375rem` (6px). Cards/inputs/buttons `md`. Appointment cards `sm` (4px) — smaller blocks read cleaner. Full-round only for avatars and status dots.
- **Elevation:** data-dense means **borders separate, shadows float**. Only three shadow levels exist:
  - `shadow-none` — everything in the grid, all cards, all table rows
  - `shadow-md` — popover, dropdown, drawer, dialog
  - `shadow-lg` — the card currently being dragged (the only shadow inside the grid, and it signals "lifted")
- **Motion:** 150ms micro-interactions, 200ms drawer/dialog, exit at ~70% of enter. `transform`/`opacity` only. Realtime arrival = 250ms fade + one subtle scale pulse `0.98 → 1`. Reduced-motion is handled globally in the CSS above.

---

## 3. Data color scale (appointment cards)

Six hues, deliberately *not* including teal (reserved for chrome) and *not* including red/amber/emerald at saturation (reserved for status).

| # | Hue | Light: bg / border | Dark: bg / border |
|---|---|---|---|
| 1 | sky | `#f0f9ff` / `#0284c7` | `#082f49` / `#38bdf8` |
| 2 | violet | `#f5f3ff` / `#7c3aed` | `#2e1065` / `#a78bfa` |
| 3 | fuchsia | `#fdf4ff` / `#c026d3` | `#4a044e` / `#e879f9` |
| 4 | indigo | `#eef2ff` / `#4f46e5` | `#1e1b4b` / `#818cf8` |
| 5 | lime | `#f7fee7` / `#4d7c0f` | `#1a2e05` / `#a3e635` |
| 6 | orange | `#fff7ed` / `#c2410c` | `#431407` / `#fb923c` |

Assignment: hue is derived from `service.colorIndex` (stored, not hashed at render — stable across sessions). Card text is always `--card-foreground`, never the hue.

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
| `< 768` | bottom nav, 4 items, 56px, labels + icons | 56px: date picker + branch switcher only |
| `768–1023` | left icon rail, 56px wide, tooltips on hover | full: branch, date, search, theme, user |
| `≥ 1024` | left sidebar 240px, collapsible to rail (persisted) | full |

### Per screen

| Screen | `< 768` | `768–1023` | `≥ 1024` |
|---|---|---|---|
| **Timeline** | single dentist (segmented switch) **or** agenda list; **no drag** — tap → drawer → "Move" → slot picker | 2–3 columns, horizontal scroll-snap, sticky time gutter, column picker; drag enabled | all columns (virtualize > 10 dentists); full drag / resize / keyboard |
| **Booking wizard** | full-bleed single column, sticky footer CTA | same, `max-w-md` centered | same, centered, with clinic info sidebar |
| **Roster editor** | per-staff day list; add/edit via drawer | 3-day window, scroll-snap | full week grid + violations panel docked right (320px) |
| **Settings / Patients** | stacked cards | 2-col form grid | 2-col + `max-w-4xl` |

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

Built for `/dev/ui` gallery in W4, each with every state rendered:

| Component | States to render in the gallery |
|---|---|
| `AppointmentCard` | 6 hues × {confirmed, completed, no_show, cancelled, conflict, held, dragging, focused} |
| `TimeGrid` | 3 zoom levels × {empty, off-shift, now-line, overlapping cards, 1000-card perf case} |
| `SlotPicker` | {loading, slots available, none available, hold active, hold expired} |
| `ViolationList` | {clean, warnings only, blocking, mixed} |
| `CountdownBanner` | {>2min, <60s urgent, expired} |
| `ShiftBlock` | {saved, dragging, recurring, conflicting} |
| `EmptyState` / `ErrorState` | {no data, 409 conflict, 5xx, offline} |

---

## 7. Verification checklist (ties to the spec's Definition of Done)

- [x] Contrast ≥ 4.5:1 body / ≥ 3:1 large — enforced by `apps/web/e2e/a11y.spec.ts`, which fails the build on any `serious` or `critical` axe violation at 390px and 1440px. This checklist item was **asserted rather than verified** until W8: the original `--primary` (teal-600 `#0d9488`) gives white text only **3.74:1**, so every primary button in the app was failing AA. Corrected to teal-700 `#0f766e` (**5.47:1**); see the deviation note below.
- [ ] No status conveyed by color alone (icon or text always present)
- [ ] Timeline fully keyboard-operable; visible focus ring on every card; drag has a keyboard equivalent
- [ ] Touch targets ≥ 44px at 375px; no `body` horizontal scroll at 375 / 768 / 1024 / 1440
- [ ] `prefers-reduced-motion` honoured (global rule above)
- [ ] All times, durations, counts use `tabular-nums`
- [ ] Icons from Lucide only — one family, consistent stroke; no emoji as icons
- [ ] Public booking body text ≥ 16px
- [ ] Lighthouse mobile ≥ 90 on the public booking page

### Anti-patterns, project-specific

Never: saturated fills on appointment cards · teal on data · red/amber/emerald for anything but status · shadows inside the grid (except the dragged card) · touch drag below 768px · greyed-out unavailable slots · a spinner where a skeleton belongs · `100vh` (use `100dvh`).
