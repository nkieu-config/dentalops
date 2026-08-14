import type { Appointment, StaffMember } from "@dentalops/contracts"
import { CalendarX } from "lucide-react"
import { Fragment, type Ref, useEffect, useMemo, useRef, useState } from "react"
import { EmptyState } from "../../components/ui/empty-state"
import { cn } from "../../lib/cn"
import { AgendaFilterChips, ALL_DENTISTS } from "./agenda-filter-chips"
import { useNow } from "./hooks"
import { bkkToday, fmtTime } from "./lib/geometry"
import { appointmentHue } from "../../lib/appointment-hue"
import { AppointmentStatusMark } from "./appointment-status-mark"

interface AgendaViewProps {
  appointments: Appointment[]
  dentists: StaffMember[]
  date: string
  dentistFilter: string
  onDentistFilterChange: (value: string) => void
  conflictId?: string | null
  onOpen: (appointment: Appointment) => void
}

const NowDivider = ({ now, dividerRef }: { now: number; dividerRef?: Ref<HTMLLIElement> }) => (
  <li ref={dividerRef} data-testid="now-divider" className="flex items-center gap-2 px-3 py-1">
    <span className="h-px flex-1 bg-timeline-current-time" />
    <span className="rounded-sm bg-timeline-current-time px-1.5 type-meta font-medium text-timeline-current-time-foreground tabular-nums">
      {`now ${fmtTime(now)}`}
    </span>
    <span className="h-px flex-1 bg-timeline-current-time" />
  </li>
)

const AgendaGroupLabel = ({ children }: { children: string }) => (
  <li className="px-1 pt-2 type-meta font-semibold uppercase tracking-[0.08em] text-muted-foreground">
    {children}
  </li>
)

export const AgendaView = ({
  appointments,
  dentists,
  date,
  dentistFilter,
  onDentistFilterChange,
  conflictId = null,
  onOpen
}: AgendaViewProps) => {
  const isToday = date === bkkToday()
  const now = useNow(isToday)
  const [showAllEarlier, setShowAllEarlier] = useState(false)
  const nowDividerRef = useRef<HTMLLIElement>(null)

  const dentistNames = useMemo(
    () => new Map(dentists.map((dentist) => [dentist.id, dentist.name])),
    [dentists]
  )

  const rows = useMemo(
    () =>
      appointments
        .filter((a) => dentistFilter === ALL_DENTISTS || a.dentistId === dentistFilter)
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [appointments, dentistFilter]
  )
  const selectedDentistName = dentists.find((dentist) => dentist.id === dentistFilter)?.name
  const emptyTitle =
    dentistFilter === ALL_DENTISTS
      ? "Nothing scheduled"
      : `No appointments for ${selectedDentistName ?? "this dentist"}`

  const pastCount = isToday ? rows.filter((appointment) => Date.parse(appointment.startsAt) <= now).length : 0
  const hiddenEarlierCount = showAllEarlier ? 0 : Math.max(0, pastCount - 5)
  const visibleRows = hiddenEarlierCount > 0 ? rows.slice(hiddenEarlierCount) : rows
  const upcoming = visibleRows.findIndex((appointment) => Date.parse(appointment.startsAt) > now)
  const dividerAt = !isToday || visibleRows.length === 0 ? -1 : upcoming === -1 ? visibleRows.length : upcoming

  useEffect(() => {
    setShowAllEarlier(false)
  }, [date, dentistFilter])

  useEffect(() => {
    nowDividerRef.current?.scrollIntoView?.({ block: "center" })
  }, [date, dentistFilter])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        data-testid="agenda-filter-bar"
        className="sticky top-0 z-10 border-b border-border bg-card px-3 py-1.5"
      >
        <AgendaFilterChips
          dentists={dentists}
          appointments={appointments}
          value={dentistFilter}
          onValueChange={onDentistFilterChange}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={CalendarX} title={emptyTitle} hint="Try another day or dentist" />
      ) : (
        <ul data-testid="agenda-list" className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-timeline-canvas p-2">
          {hiddenEarlierCount > 0 ? (
            <li>
              <button
                type="button"
                className="min-h-11 w-full rounded-control px-3 text-left type-ui font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Show ${hiddenEarlierCount} earlier appointments`}
                onClick={() => setShowAllEarlier(true)}
              >
                Show {hiddenEarlierCount} earlier
              </button>
            </li>
          ) : null}
          {visibleRows.map((appointment, index) => {
            const start = Date.parse(appointment.startsAt)
            const end = Date.parse(appointment.endsAt)
            const hue = appointmentHue(appointment.service.colorIndex)
            const cancelled = appointment.status === "cancelled"
            const noShow = appointment.status === "no_show"
            const conflict = conflictId === appointment.id
            const dentistName = dentistNames.get(appointment.dentistId)
            const startsFuture = start > now
            const firstPast = isToday && index === 0 && !startsFuture
            const firstUpcoming = isToday && index === dividerAt

            return (
              <Fragment key={appointment.id}>
                {firstPast ? <AgendaGroupLabel>{`Earlier · ${pastCount}`}</AgendaGroupLabel> : null}
                {firstUpcoming ? <NowDivider now={now} dividerRef={nowDividerRef} /> : null}
                {firstUpcoming ? <AgendaGroupLabel>Upcoming</AgendaGroupLabel> : null}
                <li>
                  <button
                    type="button"
                    data-testid={`agenda-${appointment.id}`}
                    onClick={() => onOpen(appointment)}
                    className={cn(
                      "flex min-h-16 w-full flex-col items-start gap-0.5 rounded-timeline-appointment border-l-[3px] px-3 py-2 text-left type-ui text-card-foreground transition-[background-color,box-shadow] duration-150 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      cancelled && "border-l-border bg-muted text-muted-foreground",
                      conflict && "border-l-destructive"
                    )}
                    style={
                      cancelled
                        ? undefined
                        : {
                            backgroundColor: hue.background,
                            borderLeftColor: noShow
                              ? "var(--warning)"
                              : hue.border
                          }
                    }
                  >
                    <span className="flex w-full items-center gap-1">
                      <span className="font-medium tabular-nums">
                        {fmtTime(start)}–{fmtTime(end)}
                      </span>
                      <AppointmentStatusMark
                        className="ml-auto"
                        status={appointment.status}
                        conflict={conflict}
                        recurring={Boolean(appointment.seriesId)}
                        showLabel
                      />
                    </span>
                    <span className="w-full truncate font-medium" title={appointment.patient.name}>
                      {appointment.patient.name}
                    </span>
                    <span
                      className={cn(
                        cancelled ? "text-muted-foreground" : "text-appointment-muted"
                      )}
                    >
                      {dentistName ? `${dentistName} · ` : null}
                      <span className={cn(cancelled && "line-through")} title={appointment.service.name}>
                        {appointment.service.name}
                      </span>
                    </span>
                  </button>
                </li>
              </Fragment>
            )
          })}
          {dividerAt === visibleRows.length ? <NowDivider now={now} dividerRef={nowDividerRef} /> : null}
        </ul>
      )}
    </div>
  )
}
