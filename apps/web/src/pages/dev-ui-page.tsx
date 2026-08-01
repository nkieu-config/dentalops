import type {
  Appointment,
  AppointmentStatus,
  AvailabilitySlot,
  Shift,
  StaffMember
} from "@dentalops/contracts"
import { AlertTriangle, CalendarX, ServerCrash, WifiOff } from "lucide-react"
import { useMemo, useState } from "react"
import { SlotPickerView, type SlotPickerState } from "../components/slot-picker"
import { Button } from "../components/ui/button"
import { EmptyState } from "../components/ui/empty-state"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Skeleton } from "../components/ui/skeleton"
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
        dentists={dentists}
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
      <div className="flex flex-wrap items-center gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button size="sm">Small</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="max-w-xs space-y-2">
        <Label htmlFor="demo-input">Label</Label>
        <Input id="demo-input" placeholder="Input" />
        <Skeleton className="h-9 w-full" />
      </div>
      <EmptyState icon={CalendarX} title="No appointments" hint="Drag on the grid to create one" />
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
        <div className="rounded-md border border-border">
          <EmptyState icon={WifiOff} title="You are offline" hint="Changes resume when you reconnect" />
        </div>
      </div>
    </section>
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Arriving later</h2>
      <p className="text-sm text-muted-foreground">
        CountdownBanner — W6 · ViolationList · ShiftBlock — W7
      </p>
    </section>
  </div>
)
