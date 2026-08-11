# Calm Workspace Frame Design

**Date:** 2026-08-12  
**Status:** Approved direction, awaiting written-spec review

## Objective

Redesign the authenticated application shell so clinic identity, demo context, account controls, desktop navigation, tablet navigation, and mobile navigation feel like one calm premium SaaS system. Preserve the existing teal palette, typography, route permissions, and layered Timeline canvas.

## Design Direction

Use a Calm Workspace Frame composed of three related surfaces:

1. A floating workspace header for identity and utilities.
2. A floating navigation dock on large screens and a compact navigation rail on tablets.
3. A mobile bottom navigation with a stronger two-layer active state.

The shell must remain quieter than page-level command surfaces. It should establish orientation without competing with the primary action on each page.

## Responsive Contract

| Viewport | Navigation | Header identity | Account control |
| --- | --- | --- | --- |
| Below 768px | Five-item bottom navigation | Compact clinic name and visible `Demo` badge | Avatar-only trigger |
| 768–1023px | 72px icon rail with accessible labels and tooltips | Full clinic name when space allows | Avatar and name |
| 1024px and above | 224–232px floating navigation dock | Full clinic name and demo badge | Avatar, name, role, and chevron |

The main workspace must not be reduced to 576px at a 768px viewport. No shell surface may create horizontal page overflow.

## Workspace Header

### Clinic identity

- Keep the existing brand mark and clinic name as one identity cluster.
- Reserve stable width during loading to avoid layout shift.
- Use `Clinic workspace` as the neutral failure fallback instead of changing the apparent clinic name to `DentalOps`.
- Allow truncation on constrained widths while keeping the complete name available in the account popover.

### Demo status

- Replace the unexplained reset icon on mobile with a compact visible `Demo` badge.
- The badge opens or exposes concise explanatory text: demo data resets periodically.
- Keep the status secondary to clinic identity and non-alarming.
- Do not present demo mode as a health or outage status.

### Utilities

- Retain the accessible Light, Dark, and System theme menu.
- Keep utility targets at least 44px on touch layouts.
- Use explicit hover, open, pressed, and focus-visible states without layout-moving transforms.

## Account Control

The account trigger shows:

- Mobile: initials avatar.
- Tablet: initials avatar and name when space permits.
- Desktop: initials avatar, name, role, and a compact chevron.

The account popover contains:

1. User name.
2. Role and current clinic context.
3. Clinic settings for owners.
4. Appearance access without duplicating the full theme selector inside the menu.
5. A separated session action labelled `Exit demo` for demo sessions and `Log out` for normal sessions.

The popover uses existing Radix dropdown primitives and must preserve keyboard navigation, focus return, Escape dismissal, and collision handling.

## Navigation Information Architecture

Order destinations by operational frequency:

1. Timeline
2. Roster when permitted
3. Patients
4. Activity when permitted
5. Settings when permitted

Settings sits at the bottom of desktop navigation as an administrative destination. Do not add section headings for only five destinations.

## Desktop Navigation Dock

- Use an inset rounded surface with a lighter elevation than the workspace header.
- Add space between header, navigation, and page canvas instead of a full-height divider.
- Navigation rows are at least 44px high with 18px Lucide icons.
- Active state uses one calm rounded selection surface with stronger icon and label contrast.
- Inactive states remain readable in both themes and gain contrast on hover.
- Use semantic links and preserve `aria-current` behavior from React Router.

## Tablet Navigation Rail

- Use a 72px floating rail instead of a 192px text sidebar.
- Show 20px icons with accessible route names.
- Provide tooltips for pointer and keyboard users.
- Use the same active selection language as the desktop dock.
- Keep Settings anchored at the bottom.

## Mobile Bottom Navigation

- Retain a maximum of five top-level destinations.
- Keep icon and text labels visible.
- Add a rounded active icon well so the current route is recognizable without relying only on font weight or color.
- Preserve safe-area padding and main-content bottom inset.
- Do not add account, theme, or demo controls to bottom navigation.

## Loading and Error Behavior

- Clinic loading uses a stable skeleton matching the eventual name area.
- Clinic request failure renders `Clinic workspace` and leaves account actions usable.
- Role-based navigation remains derived from the authenticated session.
- Long clinic and user names must truncate without moving or hiding utility controls.

## Component Boundaries

- `AppShell`: responsive composition, route visibility, and shell layout.
- `ClinicIdentity`: loading, success, fallback, and responsive clinic naming.
- `SystemStatus`: demo badge and explanatory disclosure.
- `AccountMenu`: account trigger, user context, settings route, and session action.
- `WorkspaceNavigation`: shared route model rendered as desktop dock, tablet rail, or mobile bottom navigation.
- `WorkspaceHeaderSurface`: visual container only.

No new component library is required. Existing React Router, Radix UI, Lucide, Tailwind, and shared design tokens cover the required behavior.

## Accessibility Contract

- All icon-only controls have accessible names.
- Interactive targets are at least 44px on touch layouts.
- Focus order follows clinic identity, demo disclosure, theme, account, then navigation and main content.
- Tooltips supplement rather than replace accessible labels.
- Active navigation is communicated semantically and visually.
- Skip-to-content remains the first keyboard escape route.
- Light and dark themes preserve readable text, border, hover, active, and focus contrast.

## Test Strategy

### Component contracts

- Role-specific destinations and revised ordering.
- Desktop dock, tablet rail, and mobile bottom navigation render from one route model.
- Tablet rail replaces the full sidebar at the medium breakpoint.
- Settings anchors separately when visible.
- Clinic loading and failure fallbacks remain stable.
- Demo badge stays visible and understandable on mobile.
- Account popover exposes role, clinic, settings, and the correct session action.
- Mobile active navigation has a non-color-only visual indicator.

### Integration and visual checks

- 375×844 mobile.
- 768×1024 tablet.
- 1024×768 compact desktop.
- 1440×900 desktop.
- Light and dark themes.
- Keyboard traversal, Escape dismissal, and focus return.
- Long clinic and account names.
- No horizontal overflow or content hidden behind bottom navigation.

## Out of Scope

- Multi-clinic switching.
- New account profile editing.
- Changes to route permissions.
- Changes to the product color palette or typography system.
- Replacing Radix UI with MUI or Ant Design.
