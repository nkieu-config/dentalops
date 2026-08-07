# DentalOps Portfolio README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Restructure README.md so a recruiter can understand and try DentalOps in under a minute while a tech lead can quickly verify its architecture, correctness guarantees, and engineering judgement.

**Architecture:** Keep the current README's evidence-first claims and benchmark methodology, but put them after a visual, task-oriented product narrative. Reuse the repository's deterministic Playwright visual baselines as screenshots; this documents actual product behavior without adding a screenshot framework, mockup, or stale-prone GIF.

**Tech Stack:** GitHub-Flavored Markdown, GitHub admonitions, Mermaid, existing Playwright PNG visual baselines, pnpm workspace scripts.

## User-Approved Execution Amendment

- Defer every screenshot, image, GIF, and docs/images task until the separate frontend work is ready for review.
- Do not add image references or empty visual placeholders to README.md in this execution.
- Use text-first hero content: badges, a solo-project pitch, proof metrics, and the one-minute demo path.
- This plan file is named dentalops-readme-portfolio.md without a date; use date-free filenames for every file created for this work.

This amendment overrides Task 1 and every visual step in Tasks 2 and 3. Tasks 2 through 7 otherwise proceed as written, with Feature tour deferred rather than represented by text-only substitutes.

## Global Constraints

- Preserve only claims presently backed by a named test, source file, benchmark, CI workflow, or running product behavior.
- Retain existing CI and live-demo links; add no tracking links, new dependencies, framework-only badges, or generated marketing imagery.
- Copy visual baselines into docs/images. Do not link directly to the Playwright snapshot directory.
- Use descriptive alt text, retain a mobile public-booking screenshot, and do not expose secrets or non-demo data.
- Keep the README in English, use first-person singular for ownership, and use GFM plus GitHub admonitions.
- Keep setup commands synchronized with package.json and preserve the pnpm test:local-workflow README contract.
- Do not add a standalone licence section; LICENSE remains canonical.

---

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| README.md | Rewrite and reorder | Portfolio-facing narrative, proof, setup, constraints, and author context |
| docs/images/timeline-desktop.png | Create by copying a baseline | Hero proof of the staff scheduling interface |
| docs/images/public-booking-mobile.png | Create by copying a baseline | Proof that public booking is designed for a phone |
| docs/images/roster-desktop.png | Create by copying a baseline | Proof of weekly roster planning and validation |
| docs/images/settings-desktop.png | Create by copying a baseline | Proof of owner-managed multi-tenant configuration |
| scripts/local-workflow-readme.test.mjs | No edit expected | Existing guard that supported local commands remain documented |

## Target README Information Architecture

1. Header, CI/live-demo badges, solo-project pitch, proof metrics, and a hero screenshot.
2. Try it in 60 seconds with the owner demo, drag-conflict, and phone-to-desktop booking tasks.
3. Feature tour with four repository-owned screenshots.
4. Why I built this and What happens when a patient books, including a Mermaid system diagram.
5. Engineering decisions I would defend in an interview followed by the full named-test Evidence table.
6. Measured, then optimised; Tech stack; Quick start; API; Testing & quality; and CI/CD.
7. Documentation, concise Limitations, What building this taught me, and About.

### Task 1: Promote deterministic visual baselines into README assets

**Files:**

- Create: docs/images/timeline-desktop.png
- Create: docs/images/public-booking-mobile.png
- Create: docs/images/roster-desktop.png
- Create: docs/images/settings-desktop.png
- Source: apps/web/e2e/visual.spec.ts-snapshots/timeline-1440-light-visual-darwin.png
- Source: apps/web/e2e/visual.spec.ts-snapshots/booking-375-light-visual-darwin.png
- Source: apps/web/e2e/visual.spec.ts-snapshots/roster-1440-light-visual-darwin.png
- Source: apps/web/e2e/visual.spec.ts-snapshots/settings-1440-light-visual-darwin.png

**Interfaces:**

- Consumes: Four tracked Playwright snapshots whose screen, viewport, and theme are defined in apps/web/e2e/screens.ts.
- Produces: Stable short-path PNGs for Markdown image references in README.md.

- [ ] **Step 1: Create the documentation asset directory and copy selected stable baselines**

~~~bash
mkdir -p docs/images
cp apps/web/e2e/visual.spec.ts-snapshots/timeline-1440-light-visual-darwin.png docs/images/timeline-desktop.png
cp apps/web/e2e/visual.spec.ts-snapshots/booking-375-light-visual-darwin.png docs/images/public-booking-mobile.png
cp apps/web/e2e/visual.spec.ts-snapshots/roster-1440-light-visual-darwin.png docs/images/roster-desktop.png
cp apps/web/e2e/visual.spec.ts-snapshots/settings-1440-light-visual-darwin.png docs/images/settings-desktop.png
~~~

- [ ] **Step 2: Inspect each copied asset at native dimensions**

Confirm timeline shows dentist columns and appointment cards; booking shows the 375px service picker; roster shows the weekly grid and validation; settings shows branch, service, resource, and staff administration. Do not crop, recolour, or retouch the test outputs.

- [ ] **Step 3: Verify documentation-asset scope**

Run: git status --short docs/images

Expected: exactly four new PNG files under docs/images.

- [ ] **Step 4: Commit**

~~~bash
git add docs/images
git commit -m "docs: add DentalOps product screenshots"
~~~

### Task 2: Rebuild the first-screen recruiter experience

**Files:**

- Modify: README.md lines 1 through 20.
- Consumes: docs/images/timeline-desktop.png, the existing CI URL, deployed demo URL, and existing verified test totals.
- Produces: A header that establishes product, ownership, proof, and a working visual in the first screenful.

- [ ] **Step 1: Replace the current heading through the status blockquote**

Use this exact hierarchy and copy, retaining the current CI badge and adding only a live-demo badge:

~~~markdown
# DentalOps

[![CI](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml/badge.svg)](https://github.com/nkieu-config/dentalops/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/demo-live-brightgreen?logo=vercel&logoColor=white)](https://trydentalops.vercel.app)

**A multi-tenant scheduling system for dental clinics, built solo.** It keeps dentists, chairs, and procedure equipment from being double-booked — not by hoping requests arrive one at a time, but by making conflicting bookings impossible in PostgreSQL.

**3 user roles · staff scheduling + public booking · 667 automated tests across 92 files · deployed at $0/month**

![DentalOps staff timeline showing six dentists, appointment cards, and free slots](docs/images/timeline-desktop.png)

<p align="center"><em>The staff timeline: appointments, dentists, chairs, and availability in one working day.</em></p>
~~~

Remove the internal week-by-week status prose. Its delivery-history vocabulary does not help a new reviewer decide what the project is or why it is credible.

- [ ] **Step 2: Rename and tighten the demo walkthrough**

Rename the Try it in a minute section to Try it in 60 seconds. Keep the three existing actions, but begin with the live-demo link and name the Owner role explicitly. Preserve cold-start and reset information as:

~~~markdown
> [!NOTE]
> The demo runs on free tiers. The first API request after inactivity can take about a minute, and the seeded clinic resets every six hours, so changes are temporary.
~~~

The three tasks remain: use Try as Owner, drag an appointment to a taken slot and observe rollback, then use /book/demo-clinic on a phone and observe the staff timeline update without reload.

- [ ] **Step 3: Render-check the hero and walkthrough**

Preview in GitHub-flavoured Markdown. Verify badge layout, image resolution from docs/images, descriptive alt text, and admonition rendering.

- [ ] **Step 4: Commit**

~~~bash
git add README.md
git commit -m "docs: sharpen DentalOps portfolio introduction"
~~~

### Task 3: Add visual product proof and the central booking narrative

**Files:**

- Modify: README.md immediately after Try it in 60 seconds.
- Consumes: all four PNGs, apps/web/src/pages/landing-page.tsx, docs/booking.md, docs/availability.md, and docs/database.md.
- Produces: Recruiter-readable product proof followed by a technically accurate architecture story.

- [ ] **Step 1: Add Feature tour**

Insert this exact two-by-two GFM table. Its labels are scoped only to shipped behavior:

~~~markdown
| Staff timeline | Public booking |
| --- | --- |
| ![Desktop staff timeline with appointments organised by dentist](docs/images/timeline-desktop.png) | ![Mobile public booking flow with branch and service choices](docs/images/public-booking-mobile.png) |
| **Timeline.** Drag and keyboard scheduling with optimistic UI, server authority, and conflict rollback. | **Public booking.** A four-step, mobile-first patient flow that updates the desk through Socket.IO. |

| Weekly roster | Owner settings |
| --- | --- |
| ![Weekly roster grid with staff shifts and validation panel](docs/images/roster-desktop.png) | ![Owner settings for branches, services, resources, and staff](docs/images/settings-desktop.png) |
| **Rostering.** Recurring shifts and a dry-run check that names the appointments a change would strand. | **Clinic setup.** Owners manage branches, capacity, services, resources, and colleagues without leaving the app. |
~~~

- [ ] **Step 2: Replace What this is with a motivation section**

Use Why I built this. Keep the existing domain problem — one appointment simultaneously needs a dentist, chair, and optional equipment — in two short paragraphs. End with: The rule I held myself to: **a booking that conflicts with any required resource must be impossible to persist.**

- [ ] **Step 3: Add What happens when a patient books**

Write four numbered facts in this order:

1. The browser uses the shared availability package for immediate feedback over opening hours, shifts, appointments, blocks, and holds.
2. The public flow takes a short Redis hold as a courtesy while the patient confirms details.
3. The NestJS API recalculates authoritatively, claims the dentist and every required resource in one transaction, and PostgreSQL range exclusion constraints reject a remaining race.
4. On success the API emits the appointment to the staff timeline over Socket.IO, queues confirmation mail, and records an audit entry; Redis being unavailable removes the courtesy but not the database guarantee.

Follow with this diagram:

~~~mermaid
flowchart LR
  Patient["Patient booking or staff timeline"] --> Web["React web app"]
  Web -. "instant availability" .-> Engine["Shared availability engine"]
  Web -->|"REST + Socket.IO"| API["NestJS API"]
  API -->|"authoritative availability"| Engine
  API --> PG[("PostgreSQL: appointments and exclusion constraints")]
  API --> Redis["Redis: holds, cache, queues"]
  API --> Mongo["MongoDB: audit log"]
  API -->|"appointment created"| Web
~~~

Then link to docs/booking.md, docs/availability.md, and docs/database.md as deeper reading.

- [ ] **Step 4: Source-check every narrative claim**

Check landing-page.tsx for three demo roles, booking.md for hold/confirm behavior, availability.md for engine inputs, and database.md for constraints. Revise copy, not product behavior, if any claim is inaccurate.

- [ ] **Step 5: Commit**

~~~bash
git add README.md
git commit -m "docs: add DentalOps product tour and booking flow"
~~~

### Task 4: Reframe technical proof for a tech-lead review

**Files:**

- Modify: README.md sections currently headed Evidence, Measured then optimised, and Stack.
- Consumes: existing named-test table, benchmark documents, security document, and CI workflow.
- Produces: Reviewable decisions, preserved proof, and a stack table with trade-offs.

- [ ] **Step 1: Insert Engineering decisions I would defend in an interview before Evidence**

Add these six evidence-linked bullets:

- **Database constraints are the last authority.** Browser prediction and API validation are backed by GiST exclusion constraints over tstzrange. Link docs/database.md.
- **One availability engine runs in both places.** Browser feedback and server authority share zero-dependency TypeScript scheduling rules. Link docs/availability.md.
- **Tenant isolation is enforced at query scope.** AsyncLocalStorage plus a Prisma extension inject tenant filters; an undiscovered route fails the isolation test. Link docs/security.md.
- **Redis is an optimisation, never the integrity boundary.** Holds, cache, idempotency, and queues degrade while booking constraints remain authoritative. Link docs/booking.md.
- **Realtime reaches the desk without polling.** Socket.IO delivers a public booking to the timeline, proven with two browser contexts. Link apps/web/e2e/public-booking.spec.ts.
- **Performance work starts with a prediction.** The cache was predicted at 2.5–3× and measured at 2.6×. Link docs/benchmarks/README.md.

- [ ] **Step 2: Preserve the complete existing Evidence table verbatim**

Keep its introduction and all 20 claim-to-test rows. It is DentalOps's strongest differentiator and must not be compressed into generic test prose.

- [ ] **Step 3: Preserve performance honesty**

Keep comparison SVG, exact p50/p95 figures, prediction narrative, and cache-hit caveat. Add one sentence linking docs/benchmarks/load.md as the complementary Dockerised 60-patient write-contention check. Add no new performance numbers.

- [ ] **Step 4: Expand Stack to Layer, Choice, Why**

Retain existing technologies and add concise justifications: React/Vite for interactive staff/public flows; NestJS/Socket.IO/BullMQ for REST, realtime, and background work; shared packages to prevent scheduling-schema drift; PostgreSQL as truth and Redis as disposable acceleration; MongoDB for append-only flexible audit; Docker/Actions for production-image testing with real dependencies; Vercel/Render/Neon/Upstash/Sentry for an accessible $0 work sample.

- [ ] **Step 5: Commit**

~~~bash
git add README.md
git commit -m "docs: foreground DentalOps engineering evidence"
~~~

### Task 5: Make setup, API, quality, and CI scannable

**Files:**

- Modify: README.md sections currently headed Development and Email costs nothing and is still real.
- Consumes: package.json, apps/api/src/main.ts, .github/workflows/ci.yml, and scripts/local-workflow-readme.test.mjs.
- Produces: Accurate local-use instructions and an inspectable quality story.

- [ ] **Step 1: Rename Development to Quick start**

Keep this exact happy-path block:

~~~bash
pnpm setup
pnpm demo:seed
pnpm dev
~~~

State Node 22 and Docker prerequisites; web at http://localhost:5173; health at http://localhost:3001/api/v1/health. Keep the setup explanation, and turn reset risk into:

~~~markdown
> [!CAUTION]
> pnpm db:reset deletes all local Prisma data before reseeding. It is never run by pnpm setup or pnpm dev.
~~~

- [ ] **Step 2: Add API**

State Swagger is available at http://localhost:3001/api/docs in non-production because main.ts conditionally mounts it. State that staff uses a Bearer access token plus an httpOnly refresh cookie, then link docs/security.md. Do not add a credentialed curl recipe: DentalOps has a one-click demo, not published demo credentials.

- [ ] **Step 3: Consolidate into Testing & quality**

Keep exact existing test totals, suite breakdown, and three Playwright journeys. Present these commands together:

~~~bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @dentalops/web e2e
~~~

Retain the MailTransport explanation as a short Email delivery subsection: it is proof of a real queue/retry system that works locally without a paid provider.

- [ ] **Step 4: Add CI/CD from verified workflow behavior**

Describe only ci.yml: PRs and main pushes run README-workflow validation, Prisma generation/migration, lint, typecheck, tests, build, seeded Playwright e2e, and failure trace upload; a Docker job builds production image, starts Postgres/Redis/MongoDB dependencies, checks health/audit connection, then runs the 60-patient k6 contention test; visual regression runs only after Linux baselines exist. Link ci.yml and visual-baseline.yml. Do not call visual regression blocking while snapshots remain Darwin-only.

- [ ] **Step 5: Run documentation workflow guard**

Run: pnpm test:local-workflow

Expected: PASS, including README documents the supported local workflow commands.

- [ ] **Step 6: Commit**

~~~bash
git add README.md
git commit -m "docs: clarify DentalOps setup and quality gates"
~~~

### Task 6: Shorten limitations and add portfolio ownership context

**Files:**

- Modify: README.md sections currently headed What this deliberately does not do, Layout, and License.
- Consumes: current limitations, availability documentation, Lighthouse benchmark, and repository layout.
- Produces: Honest scope boundaries readable in one pass, plus explicit ownership and contact details.

- [ ] **Step 1: Replace the long limitations section**

Use Limitations with these six bounded bullets:

- The product is intentionally single-timezone and currently operates in Asia/Bangkok; the fixed-offset implementation is unsuitable for daylight-saving regions.
- Payments, insurance claims, and clinical records are outside this scheduling-focused scope.
- Audit logging degrades to a no-op when MongoDB cannot connect; health reports auditLog disabled so it is visible.
- Render free-tier cold starts can delay the first request by about a minute.
- Shifts move between days but not staff through drag-and-drop, and chair columns are intentionally read-only to avoid silent reassignment.
- Lighthouse is measured rather than gated; deterministic axe and source-driven contrast checks are the CI accessibility boundary.

Follow with one What v2 changes first sentence retaining headless timeline extraction, Postgres RLS defence in depth, and IANA timezone support before a second country.

- [ ] **Step 2: Remove Layout and standalone License**

The Mermaid diagram, stack table, and docs explain component layout. LICENSE already contains the licence, so a README section duplicates the canonical file.

- [ ] **Step 3: Add lessons and author context**

Add What building this taught me with two short lessons: correctness-critical rules belong in database/build enforcement, not developer memory; and cache/holds/realtime improve experience but must not become booking truth.

Add About with:

~~~markdown
Built solo by [Natthachak (@nkieu-config)](https://github.com/nkieu-config): product design, schema, backend, frontend, automated tests, CI, and deployment.

📫 natthachak.config@gmail.com · [LinkedIn](https://www.linkedin.com/in/natthachak)
~~~

- [ ] **Step 4: Commit**

~~~bash
git add README.md
git commit -m "docs: focus DentalOps limitations and ownership"
~~~

### Task 7: Verify the finished document as a reviewer would

**Files:**

- Verify: README.md
- Verify: docs/images/*.png
- Verify: scripts/local-workflow-readme.test.mjs

**Interfaces:**

- Consumes: GitHub Markdown rendering, local commands, documentation assets, and linked files.
- Produces: A README with internally consistent links, visuals, numbers, and guarantees.

- [ ] **Step 1: Run workflow contract and inspect scope**

~~~bash
pnpm test:local-workflow
git status --short
~~~

Expected: the test passes; intended changes are README.md and four docs/images PNGs, alongside pre-existing unrelated untracked files.

- [ ] **Step 2: Check every local README target**

~~~bash
rg -o '\]\([^)]*\)' README.md | sed 's/^.*(//;s/)$//' | rg -v '^https?://' | while read -r path; do test -e "$path" || printf 'MISSING %s\n' "$path"; done
~~~

Expected: no output.

- [ ] **Step 3: Perform the 60-second Markdown-preview check**

Without scrolling beyond the first major sections, confirm a reviewer can see live link, solo ownership, product purpose, actual UI, demo steps, honest cold-start note, and booking workflow. Then confirm a tech lead can find named-test Evidence, architecture diagram, benchmark, source-backed test commands, and limitations.

- [ ] **Step 4: Commit final integration**

~~~bash
git add README.md docs/images
git commit -m "docs: present DentalOps as an interview-ready work sample"
~~~

## Self-Review

### Spec coverage

The plan transfers each BranchBrew strength that fits DentalOps: visual hero, guided demo, feature tour, mobile proof, interview-ready architecture narrative, decisions, stack rationale, API instructions, CI/CD explanation, concise limitations, lessons, and explicit solo ownership. It deliberately does not copy framework-badge rows, GIFs, public credentials, or long curl examples because they add noise, require a stale-prone asset, or conflict with the one-click role demo.

It protects what DentalOps already does better: all named-test Evidence rows remain; the availability benchmark retains both prediction and caveat; contention, tenant-isolation, Redis outage, and accessibility claims remain source-backed; free-tier and visual-baseline caveats stay accurate.

### Placeholder scan

Every asset has an exact source and destination. Every added claim is given verbatim or constrained to a listed source. Every verification command and expected result is present.

### Consistency check

The planned flow maps to actual components: React/Vite, shared availability package, NestJS REST/Socket.IO, PostgreSQL constraints, Redis holds/cache/queues, and Mongo audit. It preserves commands protected by scripts/local-workflow-readme.test.mjs.

## Execution Handoff

Plan complete and saved to docs/superpowers/plans/2026-08-07-dentalops-readme-portfolio.md. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task and review between tasks.
2. **Inline Execution** — execute tasks in this session using executing-plans, in batches with review checkpoints.

Which approach?
