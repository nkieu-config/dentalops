# Timeline Command Center Redesign

**Date:** 2026-08-11  
**Status:** Draft - awaiting user review  
**Scope:** `/app/timeline`, its day and week views, mobile agenda, schedule search, and appointment create/detail sheets

## 1. Goal

Turn Timeline into a calm operational command center that remains readable under dense demo and clinic data. Preserve the successful two-layer pill controls for Day, Week, Dentists, and Chairs while improving hierarchy, responsive behavior, schedule states, and the relationship between the local toolbar and the floating workspace header.

## 2. Product Model

Timeline serves two different jobs:

- Day is a precision workspace for time-based scheduling, rescheduling, and chair or dentist allocation.
- Week is an overview for scanning workload and finding appointments across days.

The two views share date, branch, search, creation, and detail behavior, but they do not share the same visualization. Day retains the time grid. Week becomes a chronological weekly agenda board so parallel appointments never collapse into unreadable lanes.

## 3. Scope and Non-goals

### In scope

- App shell height contract used by Timeline
- Timeline page hierarchy and local command surface
- Day time grid, resource headers, current-time treatment, off-shift treatment, and appointment card interaction
- Week overview architecture
- Mobile day agenda and touch targets
- Appointment detail and create sheets
- Loading, empty, partial-error, and unavailable-resource states
- Responsive, keyboard, screen-reader, and performance regression coverage

### Out of scope

- New scheduling API endpoints or schema changes
- New metrics such as booked counts or open-hours summaries
- Replacing Radix primitives or adding MUI or Ant Design
- Changing appointment duration, conflict, recurrence, or authorization rules
- Adding global clinic search outside the currently loaded day or week

## 4. Shared Visual Contract

- Rename the page heading from `Schedule` to `Timeline` so the page title and navigation use one term.
- Place the Timeline command surface in the page canvas with an 8px mobile and 12px desktop inset.
- Use an opaque card surface, soft border, existing radius tokens, and restrained shadow matching the floating workspace header.
- Keep Day/Week and Dentists/Chairs as independent rounded segmented controls with a recessed outer track and raised selected item.
- Remove unnecessary full-width dividers. Separation comes from spacing, surface, and grouped controls.
- Keep the existing teal semantic palette and pastel service colors. Do not introduce gradients or glass effects.

## 5. Layout Contract

### App shell height

App shell owns viewport sizing through flex layout. Timeline fills the available `main` region with `min-height: 0` and must not calculate its height from a stale topbar token. The floating header, offline banner, main workspace, and mobile bottom navigation each consume their actual space without document overflow.

### Desktop

The local command surface has two rows:

```text
[ Timeline ] [ Branch ]                                      [ New appointment ]
[ Today ] [ ‹ ] [ Date or week range ] [ › ]     [ Day Week ] [ Dentists Chairs ] [ Search ]
```

- The title is primary, branch is context, and New appointment is the only primary action.
- The second row remains one line from 1024px upward.
- Total local command height should remain within 112px under normal content.
- The schedule canvas receives an inset and becomes the dominant visual layer.

### Tablet

- Keep Day and Week available.
- Day uses the existing column picker when all resources cannot fit.
- Controls may move into two balanced groups but cannot shrink below 44px.
- Horizontal snapping uses proximity rather than mandatory behavior.

### Mobile

- The first row contains branch and New appointment.
- The second row uses a fixed grid for Today, previous, date, next, and search controls.
- Previous and next controls remain at least 44px square at 320px width.
- The mobile content is explicitly a Day agenda. Dentist filtering remains directly above the list and becomes sticky within the content region.
- Day/Week and Dentist/Chair grid toggles remain desktop and tablet tools; mobile does not silently imply that the agenda is a full time grid.

## 6. Day View

### Initial position

Initial vertical scroll targets the most useful operational time:

1. one hour before the current time when viewing today and that time is within the clinic day;
2. otherwise one hour before the earliest active shift;
3. otherwise 08:00.

The target is clamped to the grid and reruns when the date or view changes.

### Canvas

- Keep sticky resource headers and time gutter.
- Use the dedicated current-time token rather than destructive red.
- Render off-shift areas as quiet contextual shading. Show `Outside shift` only when a block has enough height and avoid repeated high-contrast labels.
- Empty resource sets show an explanatory state instead of a blank canvas.
- Medium-width horizontal snapping is interruptible and never forces the user away from a partially visible column.

### Appointment cards

- 15–30 minutes: start time, patient name, and status icon.
- 45–60 minutes: time range, patient name, and service when space permits.
- 75 minutes or longer: time range, patient identity, service, and status.
- Truncated visible content remains available in the accessible name and appointment detail sheet.
- Hover adds border or shadow without translating the card vertically.
- Resize uses a 12–16px pointer hit area while keeping its visual handle quiet.
- Drag and resize previews show the proposed start and end time.
- Selected, conflict, arrived, completed, no-show, recurring, and cancelled states remain distinguishable without color alone.

## 7. Week View

Week becomes a `WeeklyAgendaBoard` with seven chronological day columns.

Each day column contains:

- weekday and date header, with today emphasized;
- appointments sorted by start time;
- compact rows containing start time, patient name, dentist name, and a concise service or status treatment;
- an empty-day state that does not add unnecessary instructional copy.

Appointment duration is written as text or available in details; it is not encoded as card height. Parallel appointments remain separate readable rows instead of narrow lanes. The board scrolls horizontally only when the viewport cannot fit the minimum readable day width. Appointment selection opens the existing detail sheet. Dragging and resizing remain Day-view behaviors.

The board limits DOM cost with day-level rendering and `content-visibility` or focused virtualization if the loaded week exceeds 50 visible appointment rows.

## 8. Mobile Agenda

- Keep chronological sorting and the now divider.
- Reduce normal row height to approximately 64–72px while retaining a 44px minimum target.
- Preserve time, patient, dentist, service, and status in a clear three-level hierarchy.
- Use a visible status label where an icon alone would be ambiguous.
- Sync the dentist filter to the Timeline URL so refresh, back, and shared links preserve it.
- Grouping may use Earlier and Upcoming for today; non-today dates remain one chronological list.
- Long names and services truncate without expanding the page horizontally.

## 9. Appointment Detail Sheet

- Desktop remains a right-side sheet.
- Mobile read-only appointments use a content-appropriate bottom sheet when the current shared Sheet primitive can support it without fragmenting behavior.
- Appointments with Move, status actions, recurrence controls, or slot selection retain a full-height working surface.
- Information order is patient, service and status, time and duration, dentist and chair, then actions.
- Metadata handles long names without overflow.
- Existing confirmation dialogs remain required for destructive or status-changing actions.

## 10. Create Appointment Sheet

- Stack Dentist and Starts below 360px; use two columns when sufficient width exists.
- Before a patient query, show at most five recent patients or a concise search prompt.
- Search results have clear loading, empty, and result states.
- Retain repeat controls and conflict handling.
- The summary appears only when it communicates resolved choices. It must not form sentences from placeholder values or repeat the date without purpose.
- The disabled booking action is accompanied by field-level cues that make the missing requirement clear.

## 11. Search

- Keep `Cmd/Ctrl + K` and the existing accessible combobox behavior.
- Name the scope clearly as the current day or week.
- Preserve keyboard navigation, Escape closing, focus restoration, and eight-result visual limit.
- Result rows continue to show date, time, patient, service, and dentist or chair context.

## 12. Loading, Empty, and Error States

- Initial skeleton mirrors the local command surface, headers, and schedule rows to reduce layout shift.
- Appointment loading is distinguishable from a truly empty schedule.
- Appointment errors keep the usable schedule visible and identify that it may be incomplete.
- Shift errors do not render the entire day as confidently outside shift; they show a partial-data callout and suppress misleading off-shift shading.
- No branches, no dentists, no chairs, no appointments, and no filtered results each receive a specific state and relevant action.
- Offline creation and status changes retain their existing disabled reason.

## 13. Accessibility and Interaction

- All touch controls remain at least 44px by 44px at 320px width.
- Keep the Timeline `h1`, named regions, radiogroups, live announcements, labelled icon controls, and keyboard appointment movement.
- Focus rings are never clipped by the schedule viewport.
- Appointment states are conveyed by accessible text or icons in addition to color.
- Animations use transform or opacity only, remain interruptible, and honor reduced motion.
- Main Timeline state, including branch, date, day or week, column grouping, hidden columns, and mobile dentist filter, remains URL-addressable.

## 14. Technical Structure

- `TimelinePage` coordinates data, URL state, view selection, drawers, and mutations.
- `TimelineToolbar` owns the responsive local command surface.
- `TimeGrid` remains Day-only.
- A new `WeeklyAgendaBoard` owns Week rendering and grouping.
- `AgendaView` remains the mobile Day renderer.
- `AppointmentCard` remains the Day-grid card.
- Existing Radix, shared Sheet, Button, AppSelect, DatePicker, SegmentedControl, and semantic CSS tokens remain the component foundation.

No new UI library is required. A virtualization dependency is considered only if measurement shows CSS containment is insufficient for dense weeks.

## 15. Verification

Automated coverage must include:

- no document overflow caused by the floating header and Timeline height contract;
- 44px date navigation targets at 320px;
- Day and Week URL persistence;
- readable Week rows under parallel appointments;
- mobile dentist-filter URL persistence;
- dynamic initial scroll target;
- compact, medium, and full appointment-card densities;
- no hover translation for time-positioned cards;
- appointments pending, shifts error, no chairs, no appointments, and filtered-empty states;
- create-sheet compact layout and patient-result states;
- existing keyboard, drag, reschedule, search, recurrence, and drawer behaviors.

Manual verification covers 320px, 375px, 768px, 1024px, 1280px, and 1440px in light and dark themes with dense demo data.

## 16. Acceptance Criteria

- Day remains a precise time-based operational workspace.
- Week remains readable with dense parallel clinic appointments.
- Timeline creates no body overflow beneath the floating header.
- Controls do not shrink below their supported touch size.
- Mobile presents a clear agenda model with persistent filtering.
- The local command surface and schedule canvas visually belong to the same premium, calm SaaS system as the floating workspace header.
- Loading, empty, partial-error, offline, long-text, keyboard, and dense-data states remain usable and accessible.
