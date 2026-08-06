# Careful Joy Workstream 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the Careful Joy Sea Glass design system and staff shell without changing product workflows.

**Architecture:** Keep existing semantic CSS token names as the boundary so feature code inherits the visual system without rewrites. Shared UI components own visual hierarchy and accessibility contracts; `AppShell` owns role-aware workspace chrome while feature routes continue to own their data and interactions.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, CVA, Radix primitives, Motion, Vitest, Testing Library, Playwright.

## Global Constraints

- Retain Plus Jakarta Sans Variable as the only UI typeface and tabular numerals for time, duration, counts and dates.
- Use Sea Glass semantic values in `apps/web/src/app.css`; do not add page-specific colour literals.
- Preserve existing booking, scheduling, role, tenant, realtime and keyboard contracts.
- Desktop staff navigation is labelled at 1024px and above; mobile navigation remains labelled and role-aware.
- Maintain visible focus, 44px mobile touch targets and reduced-motion support.
- Install only approved dependencies: Motion and individual Radix primitives required by shared components.
- Do not use dates in newly created filenames.

---

### Task 1: Sea Glass token and typography foundation

**Files:**
- Modify: `apps/web/src/app.css`
- Modify: `apps/web/scripts/verify-contrast.mjs`
- Test: `apps/web/src/lib/theme.test.ts`
- Test: `apps/web/src/lib/font.test.ts`

**Consumes:** Existing `background`, `primary`, status, grid and appointment token names.

**Produces:** Complete light and dark Sea Glass semantic variables, Tailwind token aliases, typography roles and verified contrast pairs.

- [ ] Write failing tests that assert the expected Sea Glass token values, complete dark-token coverage and typography role declarations.
- [ ] Run `pnpm --filter @dentalops/web test -- theme.test.ts font.test.ts` and confirm failures cite missing tokens or values.
- [ ] Replace semantic values in `app.css`, retain all existing aliases, add named typography utilities and update every contrast pair to match the new palette.
- [ ] Run `pnpm --filter @dentalops/web verify:contrast` and the focused tests; confirm both exit successfully.
- [ ] Commit with `feat(web): establish sea glass tokens`.

### Task 2: Shared primitive hierarchy

**Files:**
- Modify: `apps/web/src/components/ui/button.tsx`
- Modify: `apps/web/src/components/ui/card.tsx`
- Modify: `apps/web/src/components/ui/sheet.tsx`
- Create: `apps/web/src/components/ui/status-callout.tsx`
- Create: `apps/web/src/components/ui/initials-avatar.tsx`
- Create: `apps/web/src/components/ui/page-header.tsx`
- Test: `apps/web/src/components/ui/button.test.tsx`
- Test: `apps/web/src/components/ui/card.test.tsx`
- Test: `apps/web/src/components/ui/status-callout.test.tsx`
- Test: `apps/web/src/components/ui/initials-avatar.test.tsx`
- Test: `apps/web/src/components/ui/page-header.test.tsx`

**Consumes:** Task 1 semantic colour, radius, motion and typography tokens.

**Produces:** Reusable button, surface, sheet, status, identity and page-context contracts for all feature pages.

- [ ] Write failing component tests for labelled page context, deterministic initials, status icon/text pairing, card depth policy and button touch/focus states.
- [ ] Run the focused component test files and confirm each failure is caused by the missing contract.
- [ ] Implement the smallest primitives that make those assertions pass; keep `Sheet` on Radix Dialog and preserve focus trap and Escape close.
- [ ] Run focused tests, then `pnpm --filter @dentalops/web test`.
- [ ] Commit with `feat(web): evolve shared care primitives`.

### Task 3: Approved interaction primitive boundaries

**Files:**
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/src/components/ui/alert-dialog.tsx`
- Create: `apps/web/src/components/ui/tooltip.tsx`
- Create: `apps/web/src/components/ui/popover.tsx`
- Create: `apps/web/src/components/ui/tabs.tsx`
- Create: `apps/web/src/components/ui/switch.tsx`
- Create: `apps/web/src/components/ui/segmented-control.tsx`
- Create: `apps/web/src/components/ui/motion-provider.tsx`
- Modify: `apps/web/src/main.tsx`
- Test: `apps/web/src/components/ui/alert-dialog.test.tsx`
- Test: `apps/web/src/components/ui/segmented-control.test.tsx`
- Test: `apps/web/src/components/ui/switch.test.tsx`

**Consumes:** Task 1 tokens and Task 2 shared component conventions.

**Produces:** Tokenised wrappers around approved Radix/Motion dependencies, without introducing third-party styling into feature pages.

- [ ] Write failing tests for destructive confirmation action ordering, accessible labelled segmented choices and binary switch state.
- [ ] Run the focused tests and verify failure before adding dependencies or wrappers.
- [ ] Add approved dependencies with pnpm, implement thin wrappers and mount `MotionConfig reducedMotion="user"` once at the application root.
- [ ] Run focused tests, `pnpm --filter @dentalops/web typecheck` and `pnpm --filter @dentalops/web test`.
- [ ] Commit with `feat(web): add shared interaction primitives`.

### Task 4: Careful Joy staff shell

**Files:**
- Modify: `apps/web/src/components/shell/app-shell.tsx`
- Create: `apps/web/src/components/shell/clinic-identity.tsx`
- Create: `apps/web/src/components/shell/system-status.tsx`
- Modify: `apps/web/src/components/shell/offline-banner.tsx`
- Modify: `apps/web/src/components/shell/app-shell.test.tsx`
- Test: `apps/web/src/components/shell/clinic-identity.test.tsx`
- Test: `apps/web/src/components/shell/system-status.test.tsx`

**Consumes:** Tasks 1–3 primitives and current session role predicates.

**Produces:** Labelled desktop workspace navigation, compact tablet navigation, labelled mobile navigation, clinic context and composed demo/offline status.

- [ ] Write failing tests that require a labelled desktop nav, role-hidden Settings where denied, clinic identity in the topbar and distinct neutral demo versus destructive offline treatments.
- [ ] Run shell tests and confirm each failure names the missing behaviour.
- [ ] Recompose the shell without changing route paths, role predicates, skip link, bottom navigation limit or logout behaviour.
- [ ] Run shell tests, `pnpm --filter @dentalops/web test`, and the focused functional Playwright shell journey.
- [ ] Commit with `feat(web): redesign staff workspace shell`.

### Task 5: UI lab, snapshot coverage and release verification

**Files:**
- Modify: `apps/web/src/pages/dev-ui-page.tsx`
- Modify: `apps/web/src/pages/dev-ui-page.test.tsx`
- Modify: `apps/web/e2e/visual.spec.ts`
- Modify: `apps/web/e2e/screens.ts`
- Update after intentional review: `apps/web/e2e/visual.spec.ts-snapshots/*-linux.png`

**Consumes:** Tasks 1–4 visual contracts.

**Produces:** A design-system lab that demonstrates shared primitives and visual coverage of the shared shell.

- [ ] Write failing UI-lab tests for each new shared primitive and shell status treatment.
- [ ] Run the focused test and confirm it fails before updating the lab.
- [ ] Add deterministic fixtures to the UI lab and add the staff shell to visual coverage without changing feature-page workflows.
- [ ] Run `pnpm --filter @dentalops/web verify:contrast`, lint, typecheck, test, build, functional E2E and visual E2E locally.
- [ ] Review snapshot diffs intentionally, commit with `test(web): cover careful joy shared system`, then open a PR only after GitHub Actions is operational.

## Self-review

- Spec coverage: Tasks 1–5 cover every Workstream 1 item: token/typography, primitives, approved libraries, staff shell and UI-lab/snapshot update.
- Scope: Feature-page redesign, new date picker, Rive scenes and Settings navigation remain in their designated later workstreams.
- Test order: Each task begins with the failing assertion for the new behaviour before production implementation.
- Naming: This plan and all planned new paths contain no date-based filename.
