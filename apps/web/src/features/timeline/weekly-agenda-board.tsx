import type { Appointment, StaffMember } from "@dentalops/contracts"
import { CalendarX } from "lucide-react"
import { useRef } from "react"
import { EmptyState } from "../../components/ui/empty-state"
import { cn } from "../../lib/cn"
import { bkkDate, bkkToday, fmtCompactDay, fmtTime, fmtWeekdayShort, weekDates } from "./lib/geometry"
import { appointmentHue } from "../../lib/appointment-hue"
import { AppointmentStatusMark } from "./appointment-status-mark"
import { useHorizontalOverflow } from "./use-horizontal-overflow"
import { appointmentStatus } from "../../lib/appointment-status"

interface WeeklyAgendaBoardProps {
  weekStart: string
  appointments: Appointment[]
  dentists: StaffMember[]
  onOpen: (appointment: Appointment) => void
}

interface WeeklyAgendaDayProps {
  date: string
  appointments: Appointment[]
  dentistNames: ReadonlyMap<string, string>
  onOpen: (appointment: Appointment) => void
}

const WeeklyAgendaDay = ({ date, appointments, dentistNames, onOpen }: WeeklyAgendaDayProps) => {
  const today = date === bkkToday()

  return (
    <article
      data-testid={`week-day-${date}`}
      data-today={today || undefined}
      className={cn(
        "min-w-0 rounded-timeline-shell border border-border bg-timeline-shell",
        today && "ring-1 ring-primary/30"
      )}
      style={{ contentVisibility: "auto" }}
    >
      <header className="sticky top-0 z-10 flex items-center gap-2 rounded-timeline-header bg-timeline-header px-3 py-2">
        <time dateTime={date} className="type-ui font-semibold text-foreground">
          {fmtWeekdayShort(date)}
        </time>
        <time dateTime={date} className={cn("type-meta font-medium tabular-nums text-muted-foreground", today && "text-primary")}>
          {fmtCompactDay(date)}
        </time>
        {appointments.length > 0 ? (
          <span
            data-testid={`week-count-${date}`}
            className="ml-auto shrink-0 rounded-full bg-secondary px-1.5 type-meta font-semibold text-secondary-foreground tabular-nums"
            aria-label={`${appointments.length} ${appointments.length === 1 ? "appointment" : "appointments"}`}
          >
            {appointments.length}
          </span>
        ) : null}
      </header>
      <div className="space-y-1 p-1.5">
        {appointments.length === 0 ? (
          <p className="px-2 py-3 text-center type-meta text-muted-foreground">No appointments</p>
        ) : (
          appointments.map((appointment) => {
            const dentistName = dentistNames.get(appointment.dentistId) ?? "Unassigned dentist"
            const status = appointmentStatus[appointment.status].label
            const start = fmtTime(Date.parse(appointment.startsAt))
            const end = fmtTime(Date.parse(appointment.endsAt))
            const timeRange = `${start}–${end}`
            return (
              <button
                key={appointment.id}
                type="button"
                data-testid={`week-appt-${appointment.id}`}
                aria-label={`${timeRange}, ${appointment.patient.name}, ${dentistName}, ${appointment.service.name}, ${status}`}
                onClick={() => onOpen(appointment)}
                className={cn(
                  "flex min-h-11 w-full min-w-0 flex-col items-start gap-0.5 rounded-timeline-appointment border-l-[3px] px-2 py-1.5 text-left type-dense text-card-foreground transition-[background-color,box-shadow] duration-150 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  appointment.status === "cancelled" && "border-l-border bg-muted text-muted-foreground"
                )}
                style={
                  appointment.status === "cancelled"
                    ? undefined
                    : {
                        backgroundColor: appointmentHue(appointment.service.colorIndex).background,
                        borderLeftColor: appointmentHue(appointment.service.colorIndex).border
                      }
                }
              >
                <span className="flex w-full min-w-0 items-center gap-1.5">
                  <span className="shrink-0 font-medium tabular-nums">{timeRange}</span>
                  <AppointmentStatusMark className="ml-auto" status={appointment.status} recurring={Boolean(appointment.seriesId)} />
                </span>
                <span className="flex w-full min-w-0 items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate font-medium" title={appointment.patient.name}>
                    {appointment.patient.name}
                  </span>
                </span>
                <span
                  className={cn(
                    "w-full truncate text-appointment-muted",
                    appointment.status === "cancelled" && "text-muted-foreground",
                  )}
                  title={dentistName}
                >
                  {dentistName}
                </span>
                <span
                  className={cn(
                    "w-full truncate text-appointment-muted",
                    appointment.status === "cancelled" && "line-through text-muted-foreground",
                  )}
                  title={appointment.service.name}
                >
                  {appointment.service.name}
                </span>
              </button>
            )
          })
        )}
      </div>
    </article>
  )
}

export const WeeklyAgendaBoard = ({ weekStart, appointments, dentists, onOpen }: WeeklyAgendaBoardProps) => {
  const dentistNames = new Map(dentists.map((dentist) => [dentist.id, dentist.name]))
  const scrollRef = useRef<HTMLDivElement>(null)
  const edges = useHorizontalOverflow(scrollRef)

  if (appointments.length === 0) {
    return (
      <section aria-label="Weekly appointment overview" className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
        <EmptyState
          icon={CalendarX}
          title="No appointments this week"
          hint="Choose another week or create an appointment."
        />
      </section>
    )
  }

  return (
    <section aria-label="Weekly appointment overview" className="relative min-h-0 flex-1 p-2 sm:p-3">
      {edges.start ? (
        <div
          aria-hidden="true"
          data-testid="week-more-start"
          className="pointer-events-none absolute bottom-2 left-2 top-2 z-20 w-8 bg-linear-to-r from-timeline-canvas to-transparent sm:bottom-3 sm:left-3 sm:top-3"
        />
      ) : null}
      {edges.end ? (
        <div
          aria-hidden="true"
          data-testid="week-more-end"
          className="pointer-events-none absolute bottom-2 right-2 top-2 z-20 w-8 bg-linear-to-l from-timeline-canvas to-transparent sm:bottom-3 sm:right-3 sm:top-3"
        />
      ) : null}
      <div ref={scrollRef} className="h-full min-h-0 overflow-auto overscroll-x-contain">
      <div data-testid="weekly-agenda-board" className="grid min-w-280 grid-cols-7 gap-2">
        {weekDates(weekStart).map((date) => {
          const rows = appointments
            .filter((appointment) => bkkDate(Date.parse(appointment.startsAt)) === date)
            .toSorted(
              (left, right) =>
                Date.parse(left.startsAt) - Date.parse(right.startsAt) ||
                left.patient.name.localeCompare(right.patient.name)
            )
          return (
            <WeeklyAgendaDay
              key={date}
              date={date}
              appointments={rows}
              dentistNames={dentistNames}
              onOpen={onOpen}
            />
          )
        })}
      </div>
      </div>
    </section>
  )
}
