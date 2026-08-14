import type {
  Appointment,
  AppointmentStatus,
  AvailabilitySlot,
  Shift,
  StaffMember,
  Violation
} from "@dentalops/contracts"
import {
  AlertTriangle,
  CalendarCheck,
  CalendarX,
  CheckCircle2,
  ClipboardList,
  Info,
  Plus,
  ServerCrash,
  Settings2,
  Users,
  XCircle
} from "lucide-react"
import { useMemo, useState, type ReactNode } from "react"
import { AccountMenu } from "../components/shell/account-menu"
import { ClinicIdentity } from "../components/shell/clinic-identity"
import { OfflineBannerView } from "../components/shell/offline-banner"
import { PublicNav } from "../components/shell/public-nav"
import { SystemStatus } from "../components/shell/system-status"
import { ThemeToggle } from "../components/shell/theme-toggle"
import { WorkspaceHeaderSurface } from "../components/shell/workspace-header-surface"
import { WorkspaceNavigation, type WorkspaceNavItem } from "../components/shell/workspace-navigation"
import { SlotPickerView, type SlotPickerState } from "../components/slot-picker"
import { AlertDialog } from "../components/ui/alert-dialog"
import { Badge } from "../components/ui/badge"
import { BrandMark } from "../components/ui/brand-mark"
import { Button, buttonVariants } from "../components/ui/button"
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { DatePicker } from "../components/ui/date-picker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../components/ui/dropdown-menu"
import { InitialsAvatar } from "../components/ui/initials-avatar"
import { PageHeader, PageTitle } from "../components/ui/page-header"
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover"
import { SegmentedControl } from "../components/ui/segmented-control"
import { Sheet } from "../components/ui/sheet"
import { StatusCallout } from "../components/ui/status-callout"
import { Tooltip } from "../components/ui/tooltip"
import { EmptyState } from "../components/ui/empty-state"
import { Checkbox } from "../components/ui/checkbox"
import { Field, FieldInput, FormError, SubmitButton } from "../components/ui/form-field"
import { PHONE_ERROR } from "../lib/phone"
import { AppSelect } from "../components/ui/app-select"
import { Skeleton } from "../components/ui/skeleton"
import { CountdownBanner } from "../features/booking/countdown-banner"
import { SlotStep } from "../features/booking/steps/slot-step"
import type { WizardRecovery } from "../features/booking/wizard-reducer"
import { ShiftBlock } from "../features/roster/shift-block"
import { ViolationList, type ViolationLink } from "../features/roster/violation-list"
import { AppointmentCard } from "../features/timeline/appointment-card"
import { bkkDayStart } from "../features/timeline/lib/geometry"
import { layoutByDentist } from "../features/timeline/lib/lanes"
import { TimeGrid } from "../features/timeline/time-grid"

const tokenGroups: Array<{ title: string; tokens: string[] }> = [
  {
    title: "Ground and text",
    tokens: ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "muted", "muted-foreground"]
  },
  {
    title: "Surfaces that layer",
    tokens: ["surface-band", "surface-subtle", "surface-inverse", "surface-inverse-foreground", "surface-inverse-border", "overlay", "spotlight", "selection"]
  },
  {
    title: "Brand and interaction",
    tokens: ["primary", "primary-foreground", "primary-surface", "primary-on-surface", "secondary", "secondary-foreground", "accent", "accent-foreground", "ring", "input", "border"]
  },
  {
    title: "Status — reserved, never decorative",
    tokens: ["destructive", "destructive-foreground", "destructive-surface", "destructive-on-surface", "warning", "warning-foreground", "warning-surface", "warning-on-surface", "success", "success-foreground", "success-surface", "success-on-surface"]
  },
  {
    title: "Decorative — never reports anything",
    tokens: ["decorative", "decorative-surface", "decorative-on-surface"]
  },
  {
    title: "Timeline",
    tokens: ["timeline-canvas", "timeline-shell", "timeline-header", "timeline-offshift", "timeline-resource-line", "timeline-current-time", "timeline-current-time-foreground", "appointment-muted"]
  }
]

const tokenPairs: Array<[string, string]> = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["muted-foreground", "muted"],
  ["primary-foreground", "primary"],
  ["primary-on-surface", "primary-surface"],
  ["secondary-foreground", "secondary"],
  ["accent-foreground", "accent"],
  ["destructive-foreground", "destructive"],
  ["destructive-on-surface", "destructive-surface"],
  ["warning-foreground", "warning"],
  ["warning-on-surface", "warning-surface"],
  ["success-foreground", "success"],
  ["success-on-surface", "success-surface"],
  ["decorative-on-surface", "decorative-surface"],
  ["surface-inverse-foreground", "surface-inverse"]
]

const sectionId = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

const GallerySection = ({
  title,
  note,
  children
}: {
  title: string
  note?: string
  children: ReactNode
}) => (
  <section id={sectionId(title)} className="scroll-mt-4 space-y-3">
    <h2 className="type-subsection-title font-semibold">{title}</h2>
    {note ? <p className="type-ui text-muted-foreground">{note}</p> : null}
    {children}
  </section>
)

const SECTION_TITLES = [
  "Tokens",
  "Shell",
  "Primitives",
  "AppointmentCard",
  "TimeGrid",
  "SlotPicker",
  "Hold countdown and recovery",
  "ShiftBlock",
  "ViolationList",
  "Empty and error states",
  "Offline banner",
  "Coverage"
]

const GalleryIndex = () => (
  <nav aria-label="Sections" className="flex flex-wrap gap-1.5">
    {SECTION_TITLES.map((title) => (
      <a
        key={title}
        href={`#${sectionId(title)}`}
        className="rounded-full bg-secondary px-3 py-1 type-meta font-medium text-secondary-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {title}
      </a>
    ))}
  </nav>
)

const NAV_ITEMS: WorkspaceNavItem[] = [
  { to: "/dev/ui", label: "Gallery", icon: CalendarCheck },
  { to: "/app/roster", label: "Roster", icon: Users },
  { to: "/app/patients", label: "Patients", icon: ClipboardList },
  { to: "/app/settings", label: "Settings", icon: Settings2, group: "admin" }
]

const DEMO_CLINIC = {
  id: "f0000000-0000-4000-8000-000000000900",
  name: "Bangkok Smile Dental",
  slug: "bangkok-smile",
  publicBookingPath: "/book/bangkok-smile"
}

const DEMO_SESSION = {
  accessToken: "gallery",
  user: {
    id: "f0000000-0000-4000-8000-000000000901",
    tenantId: "f0000000-0000-4000-8000-000000000902",
    name: "Anong Prasert",
    role: "owner" as const
  }
}

const hues = [0, 1, 2, 3, 4, 5]

const statuses: AppointmentStatus[] = ["confirmed", "completed", "no_show", "cancelled"]

const serviceNames = ["Cleaning", "Filling", "Whitening", "Root canal", "Extraction", "Checkup"]

const HOUR = 3_600_000
const GALLERY_DATE = "2026-08-03"
const galleryDayStart = bkkDayStart(GALLERY_DATE)
const cardGridDayStart = galleryDayStart + 9 * HOUR

const noop = () => {}

const uuid = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, "0")}`

interface FixtureOverrides {
  id?: string
  dentistId?: string
  startsAt?: number
  durationMin?: number
  status?: AppointmentStatus
  colorIndex?: number
}

const fixtureAppointment = (overrides: FixtureOverrides = {}): Appointment => {
  const colorIndex = overrides.colorIndex ?? 0
  const startsAt = overrides.startsAt ?? cardGridDayStart
  const durationMin = overrides.durationMin ?? 55
  const serviceId = uuid(800 + colorIndex)
  return {
    id: overrides.id ?? uuid(1),
    branchId: uuid(900),
    serviceId,
    dentistId: overrides.dentistId ?? uuid(700),
    patientId: uuid(600),
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(startsAt + durationMin * 60_000).toISOString(),
    status: overrides.status ?? "confirmed",
    version: 1,
    seriesId: null,
    service: { id: serviceId, name: serviceNames[colorIndex] ?? "Cleaning", colorIndex },
    patient: { id: uuid(600), name: "S. Chaiwat", phone: "0812345678" },
    claims: []
  }
}

const dentist = (index: number, name: string): StaffMember => ({
  id: uuid(700 + index),
  name,
  role: "dentist",
  isActive: true
})

const shiftFor = (staff: StaffMember, fromHour: number, toHour: number, seq: number): Shift => ({
  id: uuid(500 + seq),
  staffId: staff.id,
  branchId: uuid(900),
  startsAt: new Date(galleryDayStart + fromHour * HOUR).toISOString(),
  endsAt: new Date(galleryDayStart + toHour * HOUR).toISOString()
})

const laneDentists = [dentist(0, "Dr. Anong"), dentist(1, "Dr. Boon")]

const laneShifts = laneDentists.map((staff, i) => shiftFor(staff, 9, 17, i))

const laneAppointments = [
  fixtureAppointment({
    id: uuid(101),
    dentistId: uuid(700),
    startsAt: galleryDayStart + 9 * HOUR,
    durationMin: 60,
    colorIndex: 0
  }),
  fixtureAppointment({
    id: uuid(102),
    dentistId: uuid(700),
    startsAt: galleryDayStart + 9.5 * HOUR,
    durationMin: 60,
    colorIndex: 3
  }),
  fixtureAppointment({
    id: uuid(103),
    dentistId: uuid(701),
    startsAt: galleryDayStart + 11 * HOUR,
    durationMin: 45,
    colorIndex: 4
  })
]

const dragSource = fixtureAppointment({ id: uuid(200), colorIndex: 1 })

const dragPreview = fixtureAppointment({
  id: uuid(200),
  startsAt: cardGridDayStart + 0.5 * HOUR,
  colorIndex: 1
})

const conflictCard = fixtureAppointment({ id: uuid(201), colorIndex: 2 })

const gallerySlot = (startsAt: string, endsAt: string): AvailabilitySlot => ({
  dentistId: uuid(700),
  startsAt,
  endsAt
})

const gallerySlots = [
  gallerySlot("2026-08-03T02:30:00.000Z", "2026-08-03T03:30:00.000Z"),
  gallerySlot("2026-08-03T03:30:00.000Z", "2026-08-03T04:30:00.000Z"),
  gallerySlot("2026-08-03T06:00:00.000Z", "2026-08-03T07:00:00.000Z"),
  gallerySlot("2026-08-03T07:00:00.000Z", "2026-08-03T08:00:00.000Z")
]

const slotStates: { testId: string; label: string; state: SlotPickerState }[] = [
  { testId: "slots-loading", label: "Loading", state: { status: "loading" } },
  {
    testId: "slots-available",
    label: "Slots available",
    state: { status: "ready", slots: gallerySlots }
  },
  { testId: "slots-none", label: "None available", state: { status: "ready", slots: [] } },
  { testId: "slots-error", label: "Error", state: { status: "error" } }
]

const holdStartsAt = gallerySlots[1]!.startsAt

const countdownStates = [
  { testId: "countdown-normal", label: "Over 2 minutes", offsetMs: 292_000 },
  { testId: "countdown-urgent", label: "Under a minute", offsetMs: 45_000 },
  { testId: "countdown-expired", label: "Expired", offsetMs: -1_000 }
]

interface HoldRecoveryFixture {
  testId: string
  label: string
  recovery: WizardRecovery
  nearestFree: string | null
}

const holdRecoveries: HoldRecoveryFixture[] = [
  {
    testId: "hold-expired",
    label: "Hold expired",
    recovery: { reason: "expired", startsAt: holdStartsAt },
    nearestFree: gallerySlots[2]!.startsAt
  },
  {
    testId: "hold-taken",
    label: "Lost the race — 409 SLOT_CONFLICT",
    recovery: { reason: "taken", startsAt: holdStartsAt },
    nearestFree: null
  }
]

const HoldSection = () => {
  const [base] = useState(() => Date.now())

  return (
    <GallerySection title="Hold countdown and recovery">
      <p className="type-ui text-muted-foreground">
        The countdown runs off the server's <code>expiresAt</code>, never a local timer seeded at
        mount, and turns destructive under a minute. Because a hold is only a courtesy over the
        database constraint, both ways it can end — the TTL lapsing and staff winning the race — get
        a recovery state that replaces the picker instead of failing silently.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {countdownStates.map(({ testId, label, offsetMs }) => (
          <div key={testId} className="space-y-2 rounded-card border border-border p-3">
            <p className="type-meta font-medium text-muted-foreground">{label}</p>
            <div data-testid={testId}>
              <CountdownBanner
                expiresAt={new Date(base + offsetMs).toISOString()}
                startsAt={holdStartsAt}
                onExpire={noop}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2 rounded-card border border-border p-3">
          <p className="type-meta font-medium text-muted-foreground">Acquiring the hold</p>
          <div data-testid="hold-pending">
            <SlotStep
              date={GALLERY_DATE}
              state={{ status: "ready", slots: gallerySlots }}
              recovery={null}
              nearestFree={null}
              holding
              onPick={noop}
              onDateChange={noop}
              onPickAnother={noop}
            />
          </div>
        </div>
        {holdRecoveries.map(({ testId, label, recovery, nearestFree }) => (
          <div key={testId} className="space-y-2 rounded-card border border-border p-3">
            <p className="type-meta font-medium text-muted-foreground">{label}</p>
            <div data-testid={testId}>
              <SlotStep
                date={GALLERY_DATE}
                state={{ status: "ready", slots: gallerySlots }}
                recovery={recovery}
                nearestFree={nearestFree}
                holding={false}
                onPick={noop}
                onDateChange={noop}
                onPickAnother={noop}
              />
            </div>
          </div>
        ))}
      </div>
    </GallerySection>
  )
}

const perfDentists = Array.from({ length: 8 }, (_, i) => dentist(10 + i, `Dr. ${i + 1}`))

const perfShifts = perfDentists.map((staff, i) => shiftFor(staff, 8, 20, 10 + i))

const perfDurations = [30, 45, 60]

const buildPerfAppointments = (): Appointment[] =>
  Array.from({ length: 1000 }, (_, i) =>
    fixtureAppointment({
      id: uuid(1000 + i),
      dentistId: perfDentists[i % 8]!.id,
      startsAt: galleryDayStart + (6 + (i % 56) * 0.25) * HOUR,
      durationMin: perfDurations[i % 3] ?? 30,
      colorIndex: i % 6
    })
  )

interface GalleryGridProps {
  testId: string
  dentists: StaffMember[]
  shifts: Shift[]
  appointments: Appointment[]
}

const GalleryGrid = ({ testId, dentists, shifts, appointments }: GalleryGridProps) => {
  const positions = useMemo(() => layoutByDentist(appointments), [appointments])
  return (
    <div
      data-testid={testId}
      className="flex h-96 flex-col overflow-hidden rounded-card border border-border"
    >
      <TimeGrid
        date={GALLERY_DATE}
        columns={dentists.map((dentist) => ({
          id: dentist.id,
          name: dentist.name,
          staffId: dentist.id
        }))}
        columnOf={(appointment) => appointment.dentistId}
        shifts={shifts}
        appointments={appointments}
        renderAppointment={(appointment, dayStart) => (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            dayStart={dayStart}
            lane={positions.get(appointment.id)?.lane ?? 0}
            lanes={positions.get(appointment.id)?.lanes ?? 1}
            onClick={noop}
          />
        )}
      />
    </div>
  )
}

const PerfSection = () => {
  const [mounted, setMounted] = useState(false)
  const appointments = useMemo(() => (mounted ? buildPerfAppointments() : []), [mounted])

  return (
    <GallerySection title="TimeGrid — 1,000 card perf case">
      <p className="type-ui text-muted-foreground">
        Eight dentists and 1,000 deterministic appointments. The scroll-driven visible range keeps
        the mounted DOM to what the viewport can show.
      </p>
      <Button onClick={() => setMounted(true)} disabled={mounted}>
        Render 1,000 cards
      </Button>
      {mounted ? (
        <GalleryGrid
          testId="perf-grid"
          dentists={perfDentists}
          shifts={perfShifts}
          appointments={appointments}
        />
      ) : null}
    </GallerySection>
  )
}

const rosterStaffName = (staffId: string) =>
  laneDentists.find((member) => member.id === staffId)?.name ?? "Unknown staff"

interface ShiftStateFixture {
  testId: string
  label: string
  shift: Shift
  conflicting?: boolean
  dragging?: boolean
}

const shiftStates: ShiftStateFixture[] = [
  { testId: "shift-state-saved", label: "Saved", shift: shiftFor(laneDentists[0]!, 9, 17, 30) },
  {
    testId: "shift-state-dragging",
    label: "Dragging — live validating",
    shift: shiftFor(laneDentists[0]!, 9, 17, 31),
    dragging: true
  },
  {
    testId: "shift-state-recurring",
    label: "Recurring",
    shift: { ...shiftFor(laneDentists[0]!, 9, 13, 32), seriesId: uuid(400) }
  },
  {
    testId: "shift-state-conflicting",
    label: "Conflicting",
    shift: shiftFor(laneDentists[1]!, 13, 20, 33),
    conflicting: true
  }
]

const outsideShiftViolation: Violation = {
  rule: "appointment_outside_shift",
  severity: "block",
  staffId: laneDentists[0]!.id,
  detail: "2 confirmed appointments fall outside the rostered shifts",
  appointmentIds: [uuid(101), uuid(102)]
}

const weeklyHoursViolation: Violation = {
  rule: "weekly_hours_exceeded",
  severity: "warn",
  staffId: laneDentists[0]!.id,
  detail: `3060 minutes rostered in the week of ${GALLERY_DATE}, over the 2880 minute limit`
}

const restViolation: Violation = {
  rule: "insufficient_rest",
  severity: "warn",
  staffId: laneDentists[1]!.id,
  detail: "540 minutes of rest before the next shift, under the 660 minute minimum"
}

const violationLink = (violation: Violation): ViolationLink | null => {
  const ids = violation.appointmentIds ?? []
  if (ids.length === 0) return null
  return {
    href: `/app/timeline?d=${GALLERY_DATE}&b=${uuid(900)}`,
    label: `View ${ids.length} appointments`
  }
}

const violationStates: { testId: string; label: string; violations: Violation[] }[] = [
  { testId: "violations-state-clean", label: "Clean", violations: [] },
  {
    testId: "violations-state-warnings",
    label: "Warnings only",
    violations: [weeklyHoursViolation, restViolation]
  },
  {
    testId: "violations-state-blocking",
    label: "Blocking",
    violations: [outsideShiftViolation]
  },
  {
    testId: "violations-state-mixed",
    label: "Mixed",
    violations: [outsideShiftViolation, weeklyHoursViolation, restViolation]
  }
]

const buttonLikeTrigger = buttonVariants({ variant: "secondary" })

const SheetDemo = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Sheet
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Edit shift"
        footer={<Button className="w-full" onClick={() => setOpen(false)}>Save shift</Button>}
      >
        <p className="type-ui text-muted-foreground">
          The overlay behind every edit surface: header, scrolling body, pinned footer.
        </p>
      </Sheet>
    </>
  )
}

const AlertDialogDemo = () => {
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        Deactivate branch
      </Button>
      <AlertDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Deactivate branch?"
        description="Existing booking history stays intact, but no new bookings can be made here."
        confirmLabel="Deactivate"
        cancelLabel="Keep branch"
        onConfirm={() => setConfirming(false)}
      />
    </>
  )
}

export const DevUiPage = () => (
  <div className="mx-auto w-full max-w-4xl space-y-8 p-2 sm:p-3">
    <PageTitle>/dev/ui</PageTitle>
    <GalleryIndex />
    <GallerySection
      title="Tokens"
      note="Every colour token the stylesheet defines. A token with no swatch here is a token nobody is looking at."
    >
      {tokenGroups.map((group) => (
        <div key={group.title} data-testid={`token-group-${group.title}`} className="space-y-2">
          <h3 className="type-meta font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </h3>
          <div className="flex flex-wrap gap-3">
            {group.tokens.map((name) => (
              <div key={name} data-testid={`token-${name}`} className="w-24 text-center type-meta">
                <div
                  className="h-12 w-full rounded-control border border-border"
                  style={{ background: `var(--color-${name})` }}
                />
                <span className="mt-1 block break-words">{name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <h3 className="type-meta font-semibold uppercase tracking-wide text-muted-foreground">
        The pairs the contrast gate checks
      </h3>
      <div data-testid="token-pairs" className="grid gap-2 sm:grid-cols-2">
        {tokenPairs.map(([text, surface]) => (
          <div
            key={`${text}-on-${surface}`}
            className="rounded-control border border-border px-3 py-2 type-ui font-medium"
            style={{ background: `var(--color-${surface})`, color: `var(--color-${text})` }}
          >
            {text} on {surface}
          </div>
        ))}
      </div>
      <h3 className="type-meta font-semibold uppercase tracking-wide text-muted-foreground">
        Service hues — the only place colour carries data
      </h3>
      <div className="flex gap-2">
        {hues.map((i) => (
          <div
            key={i}
            className="h-12 w-12 rounded-timeline-appointment border-l-[3px]"
            style={{ background: `var(--hue${i}-bg)`, borderLeftColor: `var(--hue${i}-border)` }}
          />
        ))}
      </div>
    </GallerySection>
    <GallerySection
      title="Shell"
      note="The chrome every staff screen sits in. The first nav item points at this page, so the current-destination treatment below is the real one, not a copy of it."
    >
      <div data-testid="shell-gallery" className="space-y-3">
        <WorkspaceHeaderSurface
          data-testid="shell-workspace-header"
          className="flex flex-wrap items-center gap-3 p-3"
        >
          <ClinicIdentity clinic={DEMO_CLINIC} />
          <div className="ml-auto flex items-center gap-2">
            <SystemStatus demo />
            <ThemeToggle />
            <AccountMenu session={DEMO_SESSION} clinic={DEMO_CLINIC} demo />
          </div>
        </WorkspaceHeaderSurface>
        <div className="rounded-card border border-border p-3">
          <WorkspaceNavigation items={NAV_ITEMS} />
        </div>
        <div className="space-y-2 rounded-card border border-border p-3">
          <ClinicIdentity loading />
          <ClinicIdentity error />
        </div>
        <PublicNav current="login" />
      </div>
    </GallerySection>
    <GallerySection title="Primitives">
      <PageHeader title="Clinic settings" description="Shared page context appears before scoped actions."><Button>Save changes</Button></PageHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Public scale</Button>
        <Button size="icon" aria-label="Add item">
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
        <AlertDialogDemo />
      </div>
      <div data-testid="control-states" className="space-y-2">
        <h3 className="type-meta font-semibold uppercase tracking-wide text-muted-foreground">
          The states one contract covers
        </h3>
        <div className="flex flex-wrap items-end gap-2">
          <Button disabled title="You are offline">Disabled, with a reason on hover</Button>
          <Button autoFocus>Focused</Button>
          <FieldInput aria-label="Disabled input" disabled defaultValue="Disabled input" className="w-48" />
          <AppSelect
            aria-label="Disabled select"
            disabled
            value="chair-1"
            onValueChange={() => {}}
            options={[{ value: "chair-1", label: "Disabled select" }]}
          />
        </div>
        <div className="max-w-xs space-y-2">
          <SubmitButton pending={false} pendingLabel="Saving…">Submit</SubmitButton>
          <SubmitButton pending pendingLabel="Saving…">Submit</SubmitButton>
        </div>
      </div>
      <div data-testid="overlay-gallery" className="flex flex-wrap items-center gap-2">
        <SheetDemo />
        <Popover>
          <PopoverTrigger className={buttonLikeTrigger}>Popover</PopoverTrigger>
          <PopoverContent className="w-56 type-ui">
            Anchored, dismissible, and never wider than the viewport.
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger className={buttonLikeTrigger}>Dropdown</DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem>Edit shift</DropdownMenuItem>
            <DropdownMenuSeparator className="my-1 h-px bg-border" />
            <DropdownMenuItem>Delete shift</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip content="One provider at the root, so a sweep across a toolbar skips the delay">
          <Button variant="secondary">Tooltip</Button>
        </Tooltip>
        <SegmentedControl
          ariaLabel="View"
          value="day"
          onValueChange={() => {}}
          options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }]}
        />
        <DatePicker
          date={GALLERY_DATE}
          onChange={() => {}}
          label="Choose a date"
          triggerLabel="Mon 3 Aug"
        />
        <BrandMark className="size-8" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <StatusCallout tone="neutral" icon={Info} title="Heads up">Something worth noticing, nothing urgent.</StatusCallout>
        <StatusCallout tone="success" icon={CheckCircle2} title="All set">The roster is fully covered for this week.</StatusCallout>
        <StatusCallout tone="warning" icon={AlertTriangle} title="Needs attention">Two appointments need a chair before this roster can be saved.</StatusCallout>
        <StatusCallout tone="destructive" icon={XCircle} title="Something failed">The last save could not go through.</StatusCallout>
        <div className="flex items-center gap-3 rounded-card border border-border p-3"><InitialsAvatar name="Dr. Anong Srisuk" /><span className="type-ui font-semibold">Dr. Anong Srisuk</span></div>
      </div>
      <div data-testid="form-primitives" className="grid max-w-lg gap-3 sm:grid-cols-2">
        <Field id="demo-input" label="Label">
          {(aria) => <FieldInput {...aria} placeholder="Input" />}
        </Field>
        <Field id="demo-select" label="Chair">
          {(aria) => <AppSelect {...aria} aria-label="Chair" value="chair-1" onValueChange={() => {}} options={[{ value: "chair-1", label: "Chair 1" }, { value: "chair-2", label: "Chair 2" }]} />}
        </Field>
        <Field id="demo-invalid" label="Mobile number" error={PHONE_ERROR}>
          {(aria) => <FieldInput {...aria} defaultValue="12345" className="tabular-nums" />}
        </Field>
        <div className="space-y-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 type-ui" htmlFor="demo-checkbox">
            <Checkbox id="demo-checkbox" defaultChecked />
            Checkbox
          </label>
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
      <div className="max-w-lg">
        <FormError message="The last save could not go through." />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>Neutral</Badge>
        <Badge tone="success">Success</Badge>
        <Badge tone="warning">Warning</Badge>
        <Badge tone="destructive">Destructive</Badge>
        <Badge tone="decorative">Decorative</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sukhumvit</CardTitle>
            <CardDescription>Open 09:00–20:00, Monday to Saturday</CardDescription>
          </CardHeader>
          <CardBody className="type-ui text-muted-foreground">
            Three chairs, six services, four dentists rostered this week.
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ladprao</CardTitle>
            <CardDescription>Open 10:00–18:00, Tuesday to Sunday</CardDescription>
          </CardHeader>
          <CardBody className="type-ui text-muted-foreground">
            Two chairs, six services, two dentists rostered this week.
          </CardBody>
        </Card>
      </div>
      <EmptyState icon={CalendarX} title="No appointments" hint="Drag on the grid to create one" />
      <EmptyState
        icon={CalendarX}
        title="Nothing booked on this day yet"
        hint="Drag anywhere on the grid to start an appointment, or pick a patient to book for."
        action={<Button>Add an appointment</Button>}
      />
    </GallerySection>
    <GallerySection title="AppointmentCard">
      <p className="type-ui text-muted-foreground">
        Six service hues across confirmed, completed, no-show and cancelled — one status per row.
      </p>
      <div data-testid="card-gallery" className="relative h-64 rounded-card border border-border">
        {statuses.map((status, row) =>
          hues.map((hue) => (
            <AppointmentCard
              key={`${status}-${hue}`}
              appointment={fixtureAppointment({
                id: uuid(row * 6 + hue + 1),
                startsAt: cardGridDayStart + row * HOUR,
                colorIndex: hue,
                status
              })}
              dayStart={cardGridDayStart}
              lane={hue}
              lanes={hues.length}
              onClick={noop}
            />
          ))
        )}
      </div>
      <p className="type-ui text-muted-foreground">
        Dragging: the source dims to 40% and the preview carries the only shadow allowed inside the
        grid. Conflict: a destructive ring plus a warning icon, never color alone.
      </p>
      <div data-testid="card-states" className="relative h-32 rounded-card border border-border">
        <AppointmentCard
          appointment={dragSource}
          dayStart={cardGridDayStart}
          lane={0}
          lanes={3}
          onClick={noop}
          dimmed
        />
        <AppointmentCard
          appointment={dragPreview}
          dayStart={cardGridDayStart}
          lane={1}
          lanes={3}
          onClick={noop}
          preview
        />
        <AppointmentCard
          appointment={conflictCard}
          dayStart={cardGridDayStart}
          lane={2}
          lanes={3}
          onClick={noop}
          conflict
        />
      </div>
    </GallerySection>
    <GallerySection title="SlotPicker">
      <p className="type-ui text-muted-foreground">
        Chips are 44px and lining-figured, grouped by Bangkok wall clock. Unavailable times are
        omitted rather than greyed, and the loading state holds the space with skeletons.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {slotStates.map(({ testId, label, state }) => (
          <div key={testId} className="space-y-2 rounded-card border border-border p-3">
            <p className="type-meta font-medium text-muted-foreground">{label}</p>
            <div data-testid={testId}>
              <SlotPickerView
                date={GALLERY_DATE}
                state={state}
                onPick={noop}
                onDateChange={noop}
              />
            </div>
          </div>
        ))}
      </div>
    </GallerySection>
    <HoldSection />
    <GallerySection title="TimeGrid">
      <p className="type-ui text-muted-foreground">
        Two dentists on a 09:00–17:00 shift, off-shift hours hatched, and two overlapping
        appointments splitting their column into lanes.
      </p>
      <GalleryGrid
        testId="lane-grid"
        dentists={laneDentists}
        shifts={laneShifts}
        appointments={laneAppointments}
      />
    </GallerySection>
    <PerfSection />
    <GallerySection title="ShiftBlock">
      <p className="type-ui text-muted-foreground">
        The roster grid is categorical — rows are staff, columns are days — so a block states its
        hours instead of encoding them as a height. A shift from a series badges it, a conflicting
        shift takes a destructive ring plus an icon rather than colour alone, and a dragging shift
        goes dashed while <code>POST /roster/validate</code> answers.
      </p>
      <div data-testid="shift-states" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shiftStates.map(({ testId, label, shift, conflicting, dragging }) => (
          <div key={testId} className="space-y-2 rounded-card border border-border p-3">
            <p className="type-meta font-medium text-muted-foreground">{label}</p>
            <div data-testid={testId}>
              <ShiftBlock
                shift={shift}
                staffName={rosterStaffName(shift.staffId)}
                onEdit={noop}
                onMoveStart={noop}
                conflicting={conflicting}
                dragging={dragging}
              />
            </div>
          </div>
        ))}
      </div>
    </GallerySection>
    <GallerySection title="ViolationList">
      <p className="type-ui text-muted-foreground">
        Blocking violations carry <code>--destructive</code> and warnings <code>--warning</code>,
        each with its own icon and a count. Blocking always sorts above warnings because only
        blocking disables Save, and a violation that names appointments links to them on the
        timeline.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {violationStates.map(({ testId, label, violations }) => (
          <div key={testId} className="space-y-2 rounded-card border border-border p-3">
            <p className="type-meta font-medium text-muted-foreground">{label}</p>
            <div data-testid={testId}>
              <ViolationList
                violations={violations}
                staffName={rosterStaffName}
                linkFor={violationLink}
              />
            </div>
          </div>
        ))}
      </div>
    </GallerySection>
    <GallerySection title="Empty and error states">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-border">
          <EmptyState icon={CalendarX} title="No appointments" hint="Nothing booked for this day" />
        </div>
        <div className="rounded-card border border-border">
          <EmptyState
            icon={AlertTriangle}
            title="That slot was just taken"
            hint="Pick another time and try again"
          />
        </div>
        <div className="rounded-card border border-border">
          <EmptyState
            icon={ServerCrash}
            title="Something went wrong"
            hint="The server could not answer — retry shortly"
          />
        </div>
      </div>
    </GallerySection>
    <GallerySection title="Offline banner">
      <p className="type-ui text-muted-foreground">
        The real <code>OfflineBanner</code> the shell renders, shown here in its offline state. While
        it is up the roster's Save and the timeline's create, drag and keyboard-nudge affordances are
        withdrawn, so nothing can be queued against a server the browser cannot reach.
      </p>
      <div className="overflow-hidden rounded-card border border-border">
        <OfflineBannerView />
      </div>
    </GallerySection>
    <GallerySection title="Coverage">
      <p className="type-ui text-muted-foreground">
        This page shows every component in <code>components/ui</code> and{" "}
        <code>components/shell</code>, plus the seven composites in MASTER §6. It does not show
        whole screens — Timeline, Roster, Settings, Patients, Activity and the booking wizard are
        compositions, and the visual suite covers those at four widths in both themes.
      </p>
      <p className="type-ui text-muted-foreground">
        Anything shared that is not on this page is unreviewed by definition. A component with no
        entry here, and a token with no swatch above, are both things nobody is looking at.
      </p>
    </GallerySection>
  </div>
)
