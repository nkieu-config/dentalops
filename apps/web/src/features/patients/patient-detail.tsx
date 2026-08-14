import { patientDetailSchema, type PatientAppointment } from "@dentalops/contracts"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  ArrowRight,
  CalendarOff,
  CalendarPlus,
  ChevronRight,
  Mail,
  Pencil,
  Phone,
  TriangleAlert
} from "lucide-react"
import { useState } from "react"
import { Link, useParams, useSearchParams } from "react-router"
import { Badge } from "../../components/ui/badge"
import { Button, buttonVariants } from "../../components/ui/button"
import { EmptyState } from "../../components/ui/empty-state"
import { PageTitle } from "../../components/ui/page-header"
import { InitialsAvatar } from "../../components/ui/initials-avatar"
import { Skeleton } from "../../components/ui/skeleton"
import { api } from "../../lib/api"
import { appointmentStatus } from "../../lib/appointment-status"
import { queryKeys } from "../../lib/query-keys"
import { useCanBook } from "../../lib/session"
import { bkkDate, fmtDay, fmtTime } from "../timeline/lib/geometry"
import { PatientEditorSheet } from "./patient-editor-sheet"

const appointmentHref = (appointment: PatientAppointment) => {
  const day = bkkDate(Date.parse(appointment.startsAt))
  return `/app/timeline?d=${day}&b=${appointment.branchId}&a=${appointment.id}`
}

const AppointmentHistoryRow = ({
  appointment,
  showBranch
}: {
  appointment: PatientAppointment
  showBranch: boolean
}) => {
  const at = Date.parse(appointment.startsAt)
  const day = bkkDate(at)
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to={appointmentHref(appointment)}
        className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 px-4 py-3 transition-[background-color,box-shadow] duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[9rem_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4"
      >
        <time
          dateTime={appointment.startsAt}
          className="col-span-2 tabular-nums type-ui font-medium text-foreground sm:col-span-1 sm:col-start-1 sm:row-span-2 sm:row-start-1"
        >
          <span className="sm:block">{fmtDay(day)}</span>
          <span className="text-muted-foreground sm:block">{fmtTime(at)}</span>
        </time>
        <span data-testid="appointment-primary" className="min-w-0 break-words font-semibold text-foreground sm:col-start-2 sm:row-start-1">
          {appointment.service.name}
        </span>
        <Badge tone={appointmentStatus[appointment.status].tone}>
          {appointmentStatus[appointment.status].label}
        </Badge>
        <span
          data-testid="appointment-context"
          className="col-span-2 min-w-0 break-words type-ui text-muted-foreground sm:col-span-1 sm:col-start-2 sm:row-start-2"
        >
          {appointment.dentist.name}
          {showBranch ? (
            <span className="type-meta">
              <span aria-hidden="true"> · </span>
              <span>{appointment.branch.name}</span>
            </span>
          ) : null}
        </span>
        <ChevronRight data-testid="appointment-disclosure" className="hidden size-4 text-muted-foreground sm:col-start-4 sm:row-span-2 sm:row-start-1 sm:block" aria-hidden="true" />
      </Link>
    </li>
  )
}

const NextAppointmentSpotlight = ({
  appointment,
  showBranch
}: {
  appointment: PatientAppointment
  showBranch: boolean
}) => {
  const at = Date.parse(appointment.startsAt)
  const day = bkkDate(at)
  return (
    <section data-testid="next-appointment-spotlight" className="rounded-card border border-primary bg-spotlight p-4 shadow-xs sm:p-5">
      <h2 className="type-ui font-semibold text-foreground">Next appointment</h2>
      <ul aria-label="Next appointment" className="mt-4">
        <li>
          <Link
            to={appointmentHref(appointment)}
            className="group grid min-h-11 gap-3 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end"
          >
            <time dateTime={appointment.startsAt} className="tabular-nums">
              <span className="block type-supporting font-medium text-foreground">{fmtDay(day)}</span>
              <span className="block type-section-title font-semibold text-foreground">{fmtTime(at)}</span>
            </time>
            <span className="min-w-0">
              <span className="flex min-w-0 items-start justify-between gap-2">
                <span data-testid="appointment-primary" className="min-w-0 break-words type-card-title font-semibold text-foreground">
                  {appointment.service.name}
                </span>
                <Badge tone={appointmentStatus[appointment.status].tone}>
                  {appointmentStatus[appointment.status].label}
                </Badge>
              </span>
              <span data-testid="appointment-context" className="mt-1 block break-words type-ui text-foreground">
                {appointment.dentist.name}
                {showBranch ? ` · ${appointment.branch.name}` : null}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 type-ui font-semibold text-primary group-hover:underline">
              View on timeline
              <ArrowRight className="size-4" aria-hidden="true" />
            </span>
          </Link>
        </li>
      </ul>
    </section>
  )
}

const HistorySection = ({
  label,
  appointments,
  visibleCount,
  expanded,
  onToggle,
  showBranch,
  expandLabel
}: {
  label: string
  appointments: PatientAppointment[]
  visibleCount: number
  expanded: boolean
  onToggle: () => void
  showBranch: boolean
  expandLabel: string
}) => {
  if (appointments.length === 0) return null
  const visible = expanded ? appointments : appointments.slice(0, visibleCount)
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <h2 className="type-ui font-semibold text-muted-foreground">{label}</h2>
        <span className="type-meta tabular-nums text-muted-foreground">{appointments.length}</span>
      </div>
      <ul aria-label={label} className="overflow-hidden rounded-card border border-border bg-card shadow-xs">
        {visible.map((appointment) => (
          <AppointmentHistoryRow key={appointment.id} appointment={appointment} showBranch={showBranch} />
        ))}
      </ul>
      {appointments.length > visibleCount ? (
        <Button variant="ghost" className="mt-2" onClick={onToggle}>
          {expanded ? "Show fewer" : expandLabel}
        </Button>
      ) : null}
    </section>
  )
}

export const PatientDetail = () => {
  const { id } = useParams()
  const [params] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [showAllUpcoming, setShowAllUpcoming] = useState(false)
  const [showAllPrevious, setShowAllPrevious] = useState(false)
  const [showAllMissed, setShowAllMissed] = useState(false)
  const canManagePatient = useCanBook()
  const search = params.get("q") ?? ""
  const backTo = search ? `/app/patients?${new URLSearchParams({ q: search })}` : "/app/patients"

  const query = useQuery({
    queryKey: queryKeys.patients.detail(id),
    queryFn: () => api(`/patients/${id}`, patientDetailSchema)
  })

  const patient = query.data
  const completedCount = patient?.appointments.filter((a) => a.status === "completed").length ?? 0
  const noShowCount = patient?.appointments.filter((a) => a.status === "no_show").length ?? 0

  return (
    <div className="mx-auto w-full max-w-4xl p-2 sm:p-3">
      <Link
        to={backTo}
        className="inline-flex min-h-11 items-center gap-2 rounded-control px-1 type-ui text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to patients
      </Link>

      {query.isPending ? (
        <div className="space-y-3 pt-3">
          <Skeleton className="h-40 w-full rounded-hero" />
          <Skeleton className="h-36 w-full rounded-card" />
          <Skeleton className="h-56 w-full rounded-card" />
        </div>
      ) : null}

      {query.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Could not load this patient"
          hint="They may have been removed, or the clinic you are signed into does not have them."
          action={<Button onClick={() => void query.refetch()}>Retry</Button>}
        />
      ) : null}

      {patient ? (
        <>
          <section
            data-testid="patient-summary"
            className="mt-3 rounded-hero border border-border bg-card p-4 shadow-xs sm:p-5"
          >
            <div className="flex items-start gap-3 sm:gap-5">
              <InitialsAvatar name={patient.name} className="size-14 type-card-title sm:size-16 sm:type-section-title" />
              <div className="min-w-0 flex-1">
                <PageTitle className="min-w-0 break-words text-foreground">{patient.name}</PageTitle>
                {patient.appointments.length > 0 ? (
                  <p data-testid="patient-visit-stats" className="mt-1 type-ui text-muted-foreground">
                    {completedCount} visit{completedCount === 1 ? "" : "s"}
                    {noShowCount > 0 ? ` · ${noShowCount} no-show${noShowCount === 1 ? "" : "s"}` : ""}
                  </p>
                ) : null}
                {canManagePatient ? (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <Link
                      to={`/app/timeline?new=appointment&p=${patient.id}`}
                      aria-label="New appointment"
                      className={`${buttonVariants()} min-h-11 min-w-0 px-3`}
                    >
                      <CalendarPlus className="size-4 shrink-0" aria-hidden="true" />
                      <span data-testid="patient-mobile-book-label" className="sm:hidden">Book</span>
                      <span className="hidden sm:inline">New appointment</span>
                    </Link>
                    <Button aria-label="Edit patient" variant="secondary" className="min-w-0 px-3" onClick={() => setEditing(true)}>
                      <Pencil className="size-4 shrink-0" aria-hidden="true" />
                      <span data-testid="patient-mobile-edit-label" className="sm:hidden">Edit</span>
                      <span className="hidden sm:inline">Edit patient</span>
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
            <dl data-testid="patient-contact-panel" className="mt-5 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
              <div className="min-w-0 rounded-card bg-surface-subtle px-3 py-2.5">
                <dt className="type-meta font-medium uppercase tracking-wide text-muted-foreground">Phone</dt>
                <dd className="mt-1 min-w-0">
                  <a href={`tel:${patient.phone}`} className="inline-flex min-h-11 max-w-full items-center gap-2 font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Phone className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{patient.phone}</span>
                  </a>
                </dd>
              </div>
              <div className="min-w-0 rounded-card bg-surface-subtle px-3 py-2.5">
                <dt className="type-meta font-medium uppercase tracking-wide text-muted-foreground">Email</dt>
                <dd className="mt-1 min-w-0">
                  {patient.email ? (
                    <a href={`mailto:${patient.email}`} className="inline-flex min-h-11 max-w-full items-center gap-2 font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Mail className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{patient.email}</span>
                    </a>
                  ) : (
                    <span className="inline-flex min-h-11 items-center gap-2 text-muted-foreground">
                      <Mail className="size-4 shrink-0" aria-hidden="true" />
                      Not on file
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          {patient.notes ? (
            <aside className="mt-4 rounded-card border border-border bg-surface-subtle p-4">
              <h2 className="type-ui font-semibold text-foreground">Front-desk note</h2>
              <p className="mt-1 whitespace-pre-wrap break-words type-ui text-muted-foreground">{patient.notes}</p>
            </aside>
          ) : null}

          {patient.appointments.length === 0 ? (
            <section className="mt-6">
              <h2 className="px-1 pb-2 type-body font-semibold">Appointment history</h2>
              <EmptyState
                icon={CalendarOff}
                title="No appointments yet"
                hint="Bookings for this patient will be listed here."
              />
            </section>
          ) : (
            <div className="mt-6 space-y-7">
              {(() => {
                const now = Date.now()
                const upcoming = patient.appointments
                  .filter((appointment) => appointment.status === "confirmed" && Date.parse(appointment.startsAt) >= now)
                  .toSorted((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
                const [nextAppointment, ...moreUpcoming] = upcoming
                const previous = patient.appointments
                  .filter(
                    (appointment) =>
                      appointment.status === "completed" ||
                      (appointment.status === "confirmed" && Date.parse(appointment.startsAt) < now)
                  )
                  .toSorted((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
                const missed = patient.appointments
                  .filter((appointment) => ["cancelled", "no_show"].includes(appointment.status))
                  .toSorted((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))
                const showBranch = new Set(patient.appointments.map((appointment) => appointment.branchId)).size > 1
                return (
                  <>
                    {nextAppointment ? (
                      <NextAppointmentSpotlight appointment={nextAppointment} showBranch={showBranch} />
                    ) : null}
                    <HistorySection
                      label="More upcoming"
                      appointments={moreUpcoming}
                      visibleCount={3}
                      expanded={showAllUpcoming}
                      onToggle={() => setShowAllUpcoming((current) => !current)}
                      showBranch={showBranch}
                      expandLabel={`Show all ${moreUpcoming.length} upcoming`}
                    />
                    <HistorySection
                      label="Previous"
                      appointments={previous}
                      visibleCount={5}
                      expanded={showAllPrevious}
                      onToggle={() => setShowAllPrevious((current) => !current)}
                      showBranch={showBranch}
                      expandLabel={`Show all ${previous.length} previous`}
                    />
                    <HistorySection
                      label="Cancelled / No-show"
                      appointments={missed}
                      visibleCount={3}
                      expanded={showAllMissed}
                      onToggle={() => setShowAllMissed((current) => !current)}
                      showBranch={showBranch}
                      expandLabel={`Show all ${missed.length} cancelled or no-show`}
                    />
                  </>
                )
              })()}
            </div>
          )}
          <PatientEditorSheet
            open={editing}
            patient={patient}
            onClose={() => setEditing(false)}
            onSaved={() => {}}
          />
        </>
      ) : null}
    </div>
  )
}
