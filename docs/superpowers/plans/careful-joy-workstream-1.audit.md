# Careful Joy Workstream 1 Plan Audit

## Audit Scope

Audited the approved Careful Joy Workstream 1 requirements, the implementation plan and commits
`3eb20d3` and `418efd4` against `main`.

## Source Requirements

The audit covers the eight numbered requirements in
`careful-joy-workstream-1.audit-input.md`: visual foundation, shared primitives, approved library
boundaries, staff shell, UI lab and behaviour-preservation constraints.

## Technical Evidence Review

`app.css` preserves the semantic-token boundary and the contrast verifier reports all declared pairs.
The branch adds focused component tests and leaves product-domain files unchanged. Full local test,
typecheck, build and browser-E2E output was not retained as auditable evidence in this review.

## Findings By Plan Section

### Task 1 — Sea Glass tokens and typography

- **Critical:** The plan promises the approved typography scale, but tokens only declare font sizes.
  They omit the specified line heights and weights, so `text-page-title`, `text-section-title` and
  related utilities cannot enforce the 28/36, 20/28, 16/24 and 12/16 contracts.
- **Warning:** `muted-foreground`, `warning`, `decorative` and several service-edge values differ
  from the approved palette. The changes are contrast-driven, but the source-of-truth specification
  was not amended with accessible variants or an explicit precedence rule.
- **Warning:** The plan lists `verify-contrast.mjs` as modified, but neither it nor its token-pair
  policy changed. The implementation instead changed token values. This is a plan/implementation
  mismatch that should be made explicit before further palette work.

### Task 2 — Shared primitive hierarchy

- **Critical:** The spec calls for 14px cards, but `Card` now uses `rounded-xl`. In the current token
  system `--radius-xl` is 20px, so this is materially rounder than the approved card surface.
- **Info:** Button, Card and Sheet remain thin shared primitives and StatusCallout pairs text with an
  icon, matching the requested component boundaries and status accessibility rule.
- **Warning:** Task 2 calls for tests of card depth and button touch/focus states, but the commit does
  not add or strengthen those specific tests. Existing tests cover some previous behaviour only.

### Task 3 — Approved interaction primitive boundaries

- **Warning:** The plan creates wrappers for AlertDialog, Tooltip, Popover, Tabs, Switch and
  ToggleGroup, but omits the approved `DropdownMenu` dependency/wrapper. A user menu in the planned
  AppShell therefore has no declared boundary.
- **Info:** Defer dependency installation until each wrapper has a concrete UI-lab or shell consumer;
  this avoids unused abstraction while retaining the approved library boundary.

### Task 4 — Staff shell

- **Warning:** The current plan has no explicit source for the clinic name/identity data. It must
  identify the existing session or clinic query before designing `ClinicIdentity`; otherwise it risks
  a fabricated product value or an extra fetch in the shell.

### Task 5 — UI lab and snapshots

- **Critical:** Linux visual baseline snapshots are not yet present, so Workstream 1 cannot meet its
  visual-gate exit condition or be safely merged as a visually gated change. Continue local work, but
  treat snapshot generation and CI review as a hard release gate once GitHub Actions recovers.

## Requirement Gaps

- The plan needs explicit type tokens that include size, line-height and weight.
- The plan needs a resolved accessible-palette table, not undocumented substitutions.
- The plan needs a 14px `radius-card` token and a small control radius token instead of relying on
  generic Tailwind radius names.
- The plan needs DropdownMenu coverage or an explicit decision to retain the existing logout button.
- The plan needs a documented clinic-identity data source.
- The plan needs recorded command output for final local verification.

## Audit Summary

The decomposition and scope boundaries are sound, and Task 1/2 are directionally correct. The branch
should not proceed to the staff-shell redesign until the typography, radius and palette-source issues
are corrected. Workstream completion remains blocked by the absent Linux visual baseline.

## Resolved Assumptions

- Contrast compliance takes precedence over an edge colour when the exact supplied edge value cannot
  meet the required minimum ratio.
- Existing semantic token names remain the application integration boundary.

## Open Questions

- Which existing clinic data source should `ClinicIdentity` consume: session tenant data, an existing
  clinic-profile query, or an explicitly scoped new shell query?
- Should the design specification be updated with accessible service-edge variants, or should the
  verifier's non-text policy be narrowed with a documented accessibility rationale?

## Sensitive Content Handling

No credentials, tokens, personal data or connection strings were included.
