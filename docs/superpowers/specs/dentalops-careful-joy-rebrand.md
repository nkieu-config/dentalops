# DentalOps Careful Joy Rebrand

## Status

Approved design direction for the next visual redesign. This specification is the source of truth for
the product experience, visual system, component boundaries, responsive behaviour and implementation
order. It does not replace the existing scheduling, availability, tenancy or permission contracts.

## Product intent

DentalOps should feel like a capable clinic home: calm enough for a patient booking a first visit,
and precise enough for a receptionist or owner to run a busy day. The design personality is
Jane-inspired rather than Jane-derived: soft clarity, friendly competence, careful colour and small
moments of joy. Cal.com remains a useful reference for operational restraint, not the visual identity.

The product language remains English. Thai belongs in internal documentation and portfolio narration
until an intentional localisation project exists; individual screens must not mix languages.

## Goals

- Make every public flow feel welcoming, clear and trustworthy.
- Make the whole staff workspace feel like one clinic product rather than a collection of utilities.
- Preserve the dense, real-time scheduling engine and expose its capability more clearly.
- Use colour to explain care, capacity, warnings and status rather than as decoration.
- Make owner configuration understandable without weakening safety around destructive actions.
- Keep keyboard, screen-reader, touch and reduced-motion support as first-class requirements.
- Establish reusable primitives so every page does not invent its own visual language.
- Make visual regression a CI gate before broad visual changes are merged.

## Non-goals

- Replacing booking, timeline drag, availability, recurring-series, roster-validation or tenancy logic.
- Building payments, insurance, clinical records, patient accounts, native applications or task
  management.
- Adding a command palette.
- Adopting a full UI kit, replacing Tailwind, or replatforming the React application.
- Introducing generic stock illustrations throughout operational screens.

## Design principles

1. **Calm surrounding chrome, exact working surface.** The app shell gives the schedule room to
   breathe; the schedule itself remains information-dense and precise.
2. **Context before controls.** Clinic, date, branch, view and consequences should be visible before
   asking a person to act.
3. **Colour has a job.** Aqua carries brand and affirmative action; appointment hues identify service
   groups; amber means attention; red is reserved for destructive or blocking states.
4. **Careful joy, never decoration.** Rounded composition, friendly copy and one purposeful visual
   moment are enough. A busy roster or timetable must stay quiet.
5. **Recoverable by default.** Every error, expired hold, validation failure and destructive action
   offers a clear next step.
6. **One product across roles.** Owners, dentists, receptionists and patients recognise the same
   clinic identity, while navigation and actions respect their permissions.

## Visual foundation

### Typography

Keep `Plus Jakarta Sans Variable` as the only UI typeface. It is already installed and provides the
warm but professional character the product needs.

| Role | Size / line height | Weight | Use |
|---|---:|---:|---|
| Display | 36 / 44 | 700 | Landing hero only |
| Page title | 28 / 36 | 700 | Public and staff top-level pages |
| Section title | 20 / 28 | 700 | Major workspace sections |
| Card title | 16 / 24 | 700 | Cards, drawers and configuration groups |
| Body | 14 / 22 | 500 | Default UI text |
| Supporting | 13 / 20 | 500 | Descriptions and helper text |
| Meta | 12 / 16 | 700 | Status, time labels and compact navigation |

Use tabular numerals for time, duration, counts and dates. No display or handwritten font is added;
the personality comes from composition and colour, not from sacrificing legibility.

### Sea Glass tokens

The application becomes light-first. Existing semantic token names remain the integration boundary,
but their values change to the following palette.

| Semantic token | Light value | Purpose |
|---|---|---|
| `background` | `#F8FBFA` | Warm, lightly green canvas |
| `foreground` | `#243330` | Primary ink |
| `card` / `popover` | `#FFFFFF` | Raised working surface |
| `primary` | `#237C78` | Main affirmative action and brand anchor |
| `primary-foreground` | `#FFFFFF` | Text on primary |
| `secondary` | `#E8F3F0` | Soft selected or supporting surface |
| `muted` | `#F0F6F4` | Quiet background and skeleton field |
| `muted-foreground` | `#647874` | Supporting copy |
| `accent` | `#DDF2ED` | Hover and selected state |
| `border` | `#D8E6E2` | Structural boundary |
| `ring` | `#176F6B` | Keyboard focus |
| `success` | `#1F7A58` | Saved, valid and available state |
| `warning` | `#A66D00` | Attention without failure |
| `destructive` | `#B94343` | Cancel, delete and blocking failure |
| `decorative` | `#3DAE9F` | Non-essential branded accent |

Appointment/service hues remain semantic data, not product state:

| Service family | Surface | Edge / label |
|---|---|---|
| Aqua | `#DDF3EE` | `#3DAE9F` |
| Lilac | `#EEE8F8` | `#A48BD2` |
| Sky | `#E4F0F8` | `#5590B3` |
| Butter | `#FFF3D5` | `#C7972D` |
| Blossom | `#F9E6EC` | `#C6758D` |
| Sage | `#E7F0DD` | `#6E9B58` |

Every combination must pass the existing contrast verification and WCAG 2.2 AA for normal text.
Appointment labels use ink text, not a coloured foreground whose contrast depends on the hue.

Dark mode is retained as a complete alternate theme, not merely inverted light mode. It uses deep
green-charcoal canvas, muted sea-glass surfaces and the same semantic status meanings. It must never
reintroduce the current near-black, industrial appearance.

### Shape, depth and spacing

- Base radius: 10px; compact controls: 8px; cards: 14px; hero/illustration surfaces: 22px.
- Reserve full pills for tags, segmented controls and navigation selection, not every button.
- Use the existing 4px spacing rhythm. Primary content gaps are 16px, section gaps 24px and page gaps
  32px or 40px.
- Borders do most of the separation. Shadows are soft, low-opacity and limited to floating sheets,
  selected cards and hero composition.
- Do not use gradients as a general surface treatment. One restrained organic colour field is allowed
  on public landing and setup/success surfaces.

### Motion

- Feedback: 120–160ms for hover, selected states and icon response.
- Layout movement: 160–220ms for cards, filters and step transitions.
- Sheet and dialog: 220ms enter, 160ms exit.
- Realtime appointment arrival: one short opacity/scale pulse only.
- No animated grid lines, looping decoration, delayed skeleton shimmer or motion that hides state.
- Configure `MotionConfig` with `reducedMotion="user"`; existing CSS reduced-motion protection remains
  in place as a fallback.

## Shared application anatomy

### Public shell

Public pages use a light, breathable shell with clinic identity before product controls. The booking
flow uses the clinic name and accent colour; the marketing landing uses DentalOps identity. Header,
step context and recovery states are shared rather than rebuilt per route.

### Staff shell

The staff workspace has four stable regions:

```text
Clinic identity and system status
├─ Persistent workspace navigation on desktop
├─ Page context and high-frequency actions
└─ Working surface: timeline, roster, directory, activity or settings
```

- Desktop at 1024px and above uses a labelled sidebar, not an icon-only rail.
- Tablet keeps enough label visibility to retain navigation comprehension.
- Mobile uses labelled bottom navigation and only surfaces destinations the signed-in role can use.
- Owner sees Timeline, Roster, Activity, Patients and Settings.
- Dentist and receptionist see only their authorised destinations. Settings is not shown when the
  route would only return an access-denied state.
- The topbar contains clinic identity, system status and a user menu. Branch is page context rather
  than a global clinic switcher.
- Demo reset is neutral information. Offline and blocked states use separate, stronger status styles.

## Public experience specification

### Landing

1. **Header:** DentalOps mark, an Explore demo link and Create your clinic CTA.
2. **Welcome canvas:** Sea Glass hero field, concise value proposition and a schedule illustration that
   communicates a calm day without pretending to be a live screenshot.
3. **Capability proof:** Real product capabilities—team availability, rooms/resources, online booking
   and owner controls—not fabricated customer quotes or metrics.
4. **Role exploration:** Owner, dentist and receptionist demo access becomes a secondary, explained
   “Step into a clinic day” module rather than the landing page's only content.
5. **Clinic-day story:** Patient booking, reception coordination and shared schedule as three concise
   product moments.
6. **Availability fallback:** When the hosted API is unavailable, show an explicit temporary-demo state
   with local-run and repository actions instead of allowing a login action to fail unexpectedly.

### Login and signup

- Login becomes “Welcome back to your clinic”: a small clinic illustration/context surface and a calm
  form card, while preserving labels, validation and existing auth behaviour.
- Add password visibility control and clear inline errors. Do not show a forgotten-password link before
  a recovery flow exists.
- Signup presents clinic identity first, then owner access, while buffering existing fields and sending
  the current single request only at completion.
- Clinic slug preview is live and visually shows the public booking path.
- Successful signup has a ready moment and setup checklist before transition into the staff workspace.

### Booking

The functional sequence remains service → dentist → time → details → confirmation.

- A clinic identity strip and named stepper replace progress bars without labels.
- Branch and service cards expose the booking choice, duration and available real data without
  inventing service descriptions.
- “Any available dentist” is a friendly recommended option, not an anonymous first list item.
- Date selection uses a tokenised calendar and time slots are grouped into morning, afternoon and
  evening.
- Slot hold, expiration and conflict recovery appear in-place as clear callouts.
- Details step keeps an appointment recap visible and names the confirmation action precisely.
- Confirmation uses one optional Rive success illustration, booking summary and the existing manage
  link. Calendar export is not added until the backend supports it.

### Manage booking

- Present a visit overview before actions.
- Reschedule is the active primary action; cancellation is a secondary destructive path.
- Reschedule shows current appointment → proposed appointment before commitment.
- Cancellation confirmation puts “Keep appointment” before the destructive action and explains that
  booking history is retained.
- Cancelled, expired and invalid-token states each provide a single useful continuation.

## Staff experience specification

### Timeline

| Zone | Required behaviour and visual outcome |
|---|---|
| Day context | Branch, full date, date navigation, Today, view mode and create action form one composed toolbar. |
| View mode | By dentist, By chair and Agenda are visible, named modes; tablet column visibility reports how many are shown. |
| Grid | Retain 24-hour precision, morning auto-scroll, current-time line, lanes and resource logic. Use quiet warm lines and soft off-shift wash. |
| Column header | Show named dentist/chair context with initials where appropriate; never truncate the only identifying information. |
| Appointment | Time, patient, service and essential status are read in that order. Service colour is a subtle surface with a coloured edge. |
| Drag/create | Preserve pointer and keyboard workflows. Ghost, preview and conflict explanation make the tentative result visible. |
| Drawer | Summary, visit actions, scheduling actions and recurring-series scope are distinct sections. Cancel always confirms. |
| Mobile | Use agenda as the primary view with sticky date context, dentist filter and bottom-sheet detail. |
| States | New dentist onboarding, partial data failure, unseated appointment explanation, offline action limits and realtime arrival are deliberate states. |

### Roster

| Zone | Required behaviour and visual outcome |
|---|---|
| Week header | Branch, week navigation, Today, coverage health and Add shift form a single context bar. |
| Weekly grid | Retain staff × day model. Staff identity, Today and empty coverage are visually legible before individual shifts. |
| Shift block | Soft capacity colour, clear time range, recurring indicator and restrained conflict emphasis. |
| Validation | “Needs attention” and “Worth checking” are separate. Links preserve the current route to affected timeline appointments. |
| Editor | Staff, date and hours flow in natural order; draft validation is visible before save; delete is isolated as destructive. |
| Responsive | Desktop has validation rail, tablet has three-day navigation, mobile uses people-first list with day chips and coverage summary. |
| States | Optimistic move, blocked move, warning, no shift, offline and save failure all preserve the user's current context. |

### Activity

- Rename the contextual heading to “Clinic activity”.
- Group audit entries by time period such as Today, Yesterday and Earlier this week.
- Row anatomy: initials avatar, human-readable action, available entity context and a readable timestamp.
- Keep cursor pagination; append loading rows rather than shifting the list.
- Do not add deep links to every audit row until the payload guarantees complete route context.
- Empty, loading and error states each include a useful explanation; permission-restricted roles do not
  see the destination in navigation.

### Patients

- Keep URL-persisted search and debounce behaviour.
- Add clear searching feedback, a patient initials avatar and stronger name/phone hierarchy.
- Do not add an unsupported Add patient action.
- Empty directory, no-result, pagination and error states have explicit recovery actions.
- Patient detail uses a profile header with phone/email touch targets and a clearly labelled
  front-desk note.
- Appointment history separates upcoming, previous and cancelled/no-show visits when the existing
  data permits. It remains scheduling history, not a clinical record.
- Existing route back to the filtered directory is preserved; history continues to link to the relevant
  timeline day until direct appointment routing exists.

### Settings

Settings is owner-only and organised around three jobs: clinic identity, scheduling capacity and team
access. It uses a sticky active section navigation on desktop and a compact section picker on mobile.

| Section | Required behaviour and visual outcome |
|---|---|
| Clinic profile | Clinic name, full public booking URL, copy/open actions and a patient-facing preview. |
| Branches | Compact weekly hours editor with open/closed toggle, multiple intervals and copy-to-weekdays action. |
| Timezone | Until timezone architecture is complete, do not represent free-text timezone as globally reliable capability. Clearly communicate Thailand/Bangkok constraint. |
| Services | Real colour swatches, treatment duration + buffer summary and timeline-card preview in editor. |
| Resources | Chairs and equipment are visually separated; branch and type are immediately readable. |
| Equipment types | Add a clinic-owned equipment-type management surface only after the API/domain decision is approved. |
| Staff | Initials, role, active state and capability context; owner protection from accidental access loss. |
| Deactivation | Use a deliberate deactivation dialog and inactive group. Do not rely on `window.confirm`. |

The recommended policy is **temporary deactivation with reactivation** for branches, services,
resources and staff: it removes an item from future booking or access without deleting history, and
permits an explicit Reactivate action. This requires matching API/list-contract work before the UI is
implemented. An owner cannot deactivate the last or current owner.

Settings data must be independently recoverable by section. A resources query failure must not make
clinic profile or staff configuration unavailable. Sheets warn before discarding unsaved form changes
and keep a sticky action footer on mobile.

## Component inventory and boundaries

### Preserve and evolve

| Existing area | Responsibility after redesign |
|---|---|
| `apps/web/src/app.css` | Semantic colour, radius, spacing, motion and appointment tokens. No page-specific colour literals. |
| `components/ui/button.tsx` | Shared button hierarchy and touch/focus contract. |
| `components/ui/card.tsx` | Base surface; page sections compose it rather than create bespoke borders. |
| `components/ui/sheet.tsx` | Shared right/bottom sheet, focus and responsive layout. |
| `components/shell/app-shell.tsx` | Role-aware staff navigation, topbar and system-status placement. |
| `features/timeline/*` | Scheduling engine, layout, drag, keyboard and realtime remain domain owners. Visual composition is separated from scheduling logic. |
| `features/roster/*` | Shift workflow and validation remain domain owners. |
| `features/patients/*` | Search, route state and patient data remain domain owners. |
| `features/settings/*` | Configuration API interaction remains domain owner; section presentation is split into focused components as it grows. |

### Add as focused primitives

| Component | Responsibility |
|---|---|
| `components/ui/alert-dialog.tsx` | Confirm cancel, deactivate, delete and discard changes. |
| `components/ui/tooltip.tsx` | Explain icon-only timeline/status controls without hiding essential text. |
| `components/ui/popover.tsx` | Column picker and compact contextual selection. |
| `components/ui/tabs.tsx` | View modes and small configuration sub-sections. |
| `components/ui/switch.tsx` | Explicit binary state such as opening day or active state. |
| `components/ui/segmented-control.tsx` | Compact named view choices; never replaces labelled navigation. |
| `components/shell/clinic-identity.tsx` | Shared clinic mark/name context for public and staff shells. |
| `components/shell/system-status.tsx` | Demo, offline and degraded-service presentation. |
| `components/ui/page-header.tsx` | Title, supporting context and scoped actions. |
| `components/ui/section-nav.tsx` | Desktop sticky and mobile compact section navigation. |
| `components/ui/status-callout.tsx` | Shared loading recovery, warning, conflict and success context. |
| `components/ui/initials-avatar.tsx` | Deterministic initials, no fabricated staff/patient photos. |

Feature components should remain close to their data/interaction owner. For example, a redesigned
`AppointmentCard` stays under `features/timeline`, while `InitialsAvatar` belongs in shared UI.

## Library boundaries

| Library | Approved use | Boundary |
|---|---|---|
| `motion` | Step transition, selected-card feedback, sheet support, layout movement and one-shot success/realtime feedback | Use `MotionConfig` and lazy features. Do not animate the timeline grid continuously. |
| Radix primitives | Add AlertDialog, Tooltip, Popover, DropdownMenu, Tabs, Switch and ToggleGroup as individual dependencies | Preserve native controls where they are already more appropriate, especially simple form selects. |
| `react-day-picker` | Tokenised calendar for booking and staff date selection | Wrap it in a DentalOps component; no third-party visual styling leaks into pages. |
| `@rive-app/react-webgl2` | Dynamically imported success, setup and empty-state illustration only | Maximum three or four purposeful scenes. Never load it in Timeline, Roster or Activity. |
| Existing Tailwind, CVA, Lucide, TanStack Query, Sonner and Radix Dialog | Continue as the system foundation | Do not replace merely for visual preference. |

Explicitly rejected: `cmdk`, a second animation library, Lottie for generic decoration, a full
component kit, `dnd-kit`, and React Hook Form introduced solely for visual reasons.

## Responsive contract

| Range | Layout contract |
|---|---|
| 0–767px | Touch-first single column, 16px page padding, minimum 44px targets, sheets from bottom, public booking and staff timeline use linear/agenda representations. |
| 768–1023px | Two-pane where useful, visible textual navigation, Timeline snap columns, Roster three-day window and validation sheet. |
| 1024px and above | Labelled persistent staff sidebar, Timeline multi-column grid, Roster validation rail and Settings sticky section navigation. |

Across all ranges:

- Focus indicators remain visible against every Sea Glass surface.
- Content must not depend on hover for meaning or access to controls.
- Status is text plus icon/colour where applicable, never colour alone.
- Dialogs and sheets maintain focus trap, escape close and accessible title.
- Dense time and calendar views retain keyboard operation.
- Safe-area padding protects mobile bottom navigation and CTA footers.

## Accessibility and quality gates

- Meet WCAG 2.2 AA contrast and keyboard expectations.
- Preserve skip link, live announcement of realtime booking and existing keyboard reschedule support.
- Every redesigned state gets unit/component coverage for role visibility, destructive confirmation and
  keyboard/focus behaviour where relevant.
- Extend browser E2E to cover owner Settings edit, service creation, role-restricted Settings access,
  booking recovery and manage-booking cancellation safety.
- Expand visual coverage to Timeline Agenda, Activity, Patient detail and booking/manage states.
- Add `pnpm --filter @dentalops/web e2e:visual` to `.github/workflows/ci.yml` as a blocking CI job.
  Snapshot updates require review; they are not an automatic formatting step.
- Run `pnpm --filter @dentalops/web verify:contrast`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
  `pnpm build`, functional E2E, accessibility E2E and visual E2E for the final release candidate.

## Implementation sequence

The redesign is deliberately split into independently reviewable workstreams. Each workstream must
finish with functional tests, visual snapshots for affected routes and a focused commit. Do not begin a
workstream whose required product decision is unresolved.

### Workstream 0 — Baseline and release safety

1. Confirm deterministic demo seed and capture current visual baseline.
2. Make visual E2E a CI gate and expand it to currently uncovered critical screens.
3. Add Settings browser journeys for owner success and non-owner denial.
4. Correct stale documentation that describes the already-built Settings workspace as unbuilt.
5. Publish the existing Phase D work only after production health and CI can be checked; when hosted
   API quota is exhausted, use the explicit temporary-demo unavailable state instead of pretending the
   interactive demo works.

**Exit condition:** visual changes cannot bypass CI, Settings has real browser coverage and documentation
matches shipped capability.

### Workstream 1 — Design system and shared shell

1. Apply Sea Glass semantic tokens, complete dark-theme tokens and Plus Jakarta typography scale.
2. Evolve Button, Card, Sheet, status callout, avatar and page-header primitives.
3. Add the approved Radix primitives and Motion provider behind shared components.
4. Redesign `AppShell` for labelled, role-aware navigation and composed system status.
5. Update the UI lab and visual snapshots before changing feature pages.

**Depends on:** Workstream 0.
**Exit condition:** existing feature behaviour renders correctly on the new primitives at all supported
breakpoints.

### Workstream 2 — Public entry and booking journey

1. Rebuild landing information hierarchy and temporary-demo state.
2. Recompose login and signup without changing their authentication contract.
3. Redesign booking step context, service/dentist selection, date/slot selection and hold recovery.
4. Redesign confirmation and manage-booking safety hierarchy.
5. Add public flow functional, accessibility and visual coverage.

**Depends on:** Workstream 1.
**Exit condition:** every booking state works with real availability and is usable at mobile width.

### Workstream 3 — Scheduling workspace

1. Recompose Timeline context bar, grid surfaces, cards, Agenda and drawers while preserving drag and
   keyboard behaviour.
2. Recompose Roster context, coverage representation, validation panel, shift blocks and editor.
3. Test realtime arrival, offline constraints, conflicts, recurring scope, drag move/create/resize and
   responsive mode transitions.

**Depends on:** Workstream 1.
**Exit condition:** the scheduling engine is behaviourally unchanged, more legible and visually gated.

### Workstream 4 — Clinic knowledge and activity

1. Redesign Activity grouping, entries, pagination and recovery states.
2. Redesign Patients directory search, result states and profile header/history.
3. Add visual snapshots for Activity and Patient detail plus browser coverage for search-to-detail route
   preservation.

**Depends on:** Workstream 1.
**Exit condition:** directory and audit work feel part of the same workspace without adding unsupported
clinical-record functionality.

### Workstream 5 — Owner configuration

1. Decide and implement the reactivation policy contract before presenting Reactivate controls.
2. Split Settings presentation into identity, capacity and team access components; make data failures
   section-local.
3. Rebuild profile, opening hours, services, resources and staff editing on shared primitives.
4. Add deactivation/discard confirmation with AlertDialog and owner safety constraints.
5. Decide whether equipment types are clinic-owned; only then add management UX/API.

**Depends on:** Workstream 1 and the reactivation policy decision.
**Exit condition:** an owner can understand the effect of every capacity/access change and recover from
temporary deactivation.

### Workstream 6 — Final polish and release

1. Introduce the few approved Rive moments after core flows are stable and measure their lazy-loaded
   bundle impact.
2. Audit focus, contrast, reduced motion, loading/error/empty states and theme parity across every
   route.
3. Update all visual baselines intentionally; review each diff.
4. Run the full local validation matrix and production smoke test when a hosted API is available.

**Depends on:** Workstreams 2–5.
**Exit condition:** no unresolved design-policy decision, accessibility regression or unreviewed visual
change remains.

## Product decisions that block only their own workstream

| Decision | Recommendation | Blocks |
|---|---|---|
| Inactive records | Temporary deactivate with Reactivate for branches, services, resources and staff | Workstream 5 only |
| Equipment types | Treat as clinic-owned master data only if owners truly need to create/manage them | Equipment-type part of Workstream 5 only |
| International timezone | Complete IANA timezone and DST architecture before claiming multi-country support | Timezone expansion only |
| Hosted demo availability | Add honest unavailable mode while Render quota is exhausted | Portfolio demo polish, not local redesign work |

## Documentation relationship

The Settings workspace is built and owner-gated. Any older design document that calls Settings
“unbuilt” must be corrected in Workstream 0. This specification supersedes prior visual direction in
`w11-redesign.md` where the two disagree, while preserving completed functional work.
