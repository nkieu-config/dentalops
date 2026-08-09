import type {
  Appointment,
  AppointmentStatus,
  AvailabilitySlot,
  Shift,
  StaffMember,
  Violation
} from "@dentalops/contracts"
import { AlertTriangle, CalendarX, ServerCrash } from "lucide-react"
import { useMemo, useState } from "react"
import { OfflineBannerView } from "../components/shell/offline-banner"
import { SlotPickerView, type SlotPickerState } from "../components/slot-picker"
import { AlertDialog } from "../components/ui/alert-dialog"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { InitialsAvatar } from "../components/ui/initials-avatar"
import { PageHeader } from "../components/ui/page-header"
import { StatusCallout } from "../components/ui/status-callout"
import { EmptyState } from "../components/ui/empty-state"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { NativeSelect } from "../components/ui/native-select"
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

const swatches = [
  "background", "foreground", "primary", "secondary", "muted", "accent",
  "destructive", "warning", "success", "border"
]

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
  { testId: "slots-none", label: "None available", state: { status: "ready", slots: [] } }
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
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Hold countdown and recovery</h2>
      <p className="text-sm text-muted-foreground">
        The countdown runs off the server's <code>expiresAt</code>, never a local timer seeded at
        mount, and turns destructive under a minute. Because a hold is only a courtesy over the
        database constraint, both ways it can end — the TTL lapsing and staff winning the race — get
        a recovery state that replaces the picker instead of failing silently.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {countdownStates.map(({ testId, label, offsetMs }) => (
          <div key={testId} className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
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
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">Acquiring the hold</p>
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
          <div key={testId} className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
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
    </section>
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
      className="flex h-96 flex-col overflow-hidden rounded-md border border-border"
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
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">TimeGrid — 1,000 card perf case</h2>
      <p className="text-sm text-muted-foreground">
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
    </section>
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
  <div className="mx-auto max-w-4xl space-y-10 p-8">
    <h1 className="text-2xl font-semibold">/dev/ui</h1>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Tokens</h2>
      <div className="flex flex-wrap gap-3">
        {swatches.map((name) => (
          <div key={name} className="text-center text-xs">
            <div
              className="h-12 w-12 rounded-md border border-border"
              style={{ background: `var(--color-${name})` }}
            />
            {name}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {hues.map((i) => (
          <div
            key={i}
            className="h-12 w-12 rounded-sm border-l-[3px]"
            style={{ background: `var(--hue${i}-bg)`, borderLeftColor: `var(--hue${i}-border)` }}
          />
        ))}
      </div>
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Primitives</h2>
      <PageHeader title="Clinic settings" description="Shared page context appears before scoped actions."><Button>Save changes</Button></PageHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button size="sm">Small</Button>
        <Button disabled>Disabled</Button>
        <AlertDialogDemo />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <StatusCallout tone="warning" icon={AlertTriangle} title="Needs attention">Two appointments need a chair before this roster can be saved.</StatusCallout>
        <div className="flex items-center gap-3 rounded-card border border-border p-3"><InitialsAvatar name="Dr. Anong Srisuk" /><span className="text-sm font-semibold">Dr. Anong Srisuk</span></div>
      </div>
      <div className="max-w-xs space-y-2">
        <Label htmlFor="demo-input">Label</Label>
        <Input id="demo-input" placeholder="Input" />
        <NativeSelect id="demo-select" defaultValue="chair-1">
          <option value="chair-1">Chair 1</option>
          <option value="chair-2">Chair 2</option>
        </NativeSelect>
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge>Neutral</Badge>
        <Badge tone="success">Confirmed</Badge>
        <Badge tone="warning">No show</Badge>
        <Badge tone="destructive">Conflict</Badge>
        <Badge tone="decorative">New</Badge>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sukhumvit</CardTitle>
            <CardDescription>Open 09:00–20:00, Monday to Saturday</CardDescription>
          </CardHeader>
          <CardBody className="text-sm text-muted-foreground">
            Three chairs, six services, four dentists rostered this week.
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Ladprao</CardTitle>
            <CardDescription>Open 10:00–18:00, Tuesday to Sunday</CardDescription>
          </CardHeader>
          <CardBody className="text-sm text-muted-foreground">
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
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">AppointmentCard</h2>
      <p className="text-sm text-muted-foreground">
        Six service hues across confirmed, completed, no-show and cancelled — one status per row.
      </p>
      <div data-testid="card-gallery" className="relative h-64 rounded-md border border-border">
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
      <p className="text-sm text-muted-foreground">
        Dragging: the source dims to 40% and the preview carries the only shadow allowed inside the
        grid. Conflict: a destructive ring plus a warning icon, never color alone.
      </p>
      <div data-testid="card-states" className="relative h-32 rounded-md border border-border">
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
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">SlotPicker</h2>
      <p className="text-sm text-muted-foreground">
        Chips are 44px and lining-figured, grouped by Bangkok wall clock. Unavailable times are
        omitted rather than greyed, and the loading state holds the space with skeletons.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {slotStates.map(({ testId, label, state }) => (
          <div key={testId} className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
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
    </section>
    <HoldSection />
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">TimeGrid</h2>
      <p className="text-sm text-muted-foreground">
        Two dentists on a 09:00–17:00 shift, off-shift hours hatched, and two overlapping
        appointments splitting their column into lanes.
      </p>
      <GalleryGrid
        testId="lane-grid"
        dentists={laneDentists}
        shifts={laneShifts}
        appointments={laneAppointments}
      />
    </section>
    <PerfSection />
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">ShiftBlock</h2>
      <p className="text-sm text-muted-foreground">
        The roster grid is categorical — rows are staff, columns are days — so a block states its
        hours instead of encoding them as a height. A shift from a series badges it, a conflicting
        shift takes a destructive ring plus an icon rather than colour alone, and a dragging shift
        goes dashed while <code>POST /roster/validate</code> answers.
      </p>
      <div data-testid="shift-states" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shiftStates.map(({ testId, label, shift, conflicting, dragging }) => (
          <div key={testId} className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
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
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">ViolationList</h2>
      <p className="text-sm text-muted-foreground">
        Blocking violations carry <code>--destructive</code> and warnings <code>--warning</code>,
        each with its own icon and a count. Blocking always sorts above warnings because only
        blocking disables Save, and a violation that names appointments links to them on the
        timeline.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {violationStates.map(({ testId, label, violations }) => (
          <div key={testId} className="space-y-2 rounded-md border border-border p-3">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
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
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Empty and error states</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-border">
          <EmptyState icon={CalendarX} title="No appointments" hint="Nothing booked for this day" />
        </div>
        <div className="rounded-md border border-border">
          <EmptyState
            icon={AlertTriangle}
            title="That slot was just taken"
            hint="Pick another time and try again"
          />
        </div>
        <div className="rounded-md border border-border">
          <EmptyState
            icon={ServerCrash}
            title="Something went wrong"
            hint="The server could not answer — retry shortly"
          />
        </div>
      </div>
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Offline banner</h2>
      <p className="text-sm text-muted-foreground">
        The real <code>OfflineBanner</code> the shell renders, shown here in its offline state. While
        it is up the roster's Save and the timeline's create, drag and keyboard-nudge affordances are
        withdrawn, so nothing can be queued against a server the browser cannot reach.
      </p>
      <div className="overflow-hidden rounded-md border border-border">
        <OfflineBannerView />
      </div>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Inventory</h2>
      <p className="text-sm text-muted-foreground">
        Every component in MASTER §6 is on this page — nothing outstanding.
      </p>
    </section>
  </div>
)
