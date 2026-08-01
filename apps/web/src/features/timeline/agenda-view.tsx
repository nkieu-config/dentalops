import type { Appointment, StaffMember } from "@dentalops/contracts"
import { AlertTriangle, Ban, CalendarX, Check, Repeat } from "lucide-react"
import { Fragment, useMemo, useState } from "react"
import { EmptyState } from "../../components/ui/empty-state"
import { NativeSelect } from "../../components/ui/native-select"
import { cn } from "../../lib/cn"
import { useNow } from "./hooks"
import { bkkToday, fmtTime } from "./lib/geometry"

const ALL_DENTISTS = "all"

interface AgendaViewProps {
  appointments: Appointment[]
  dentists: StaffMember[]
  date: string
  conflictId?: string | null
  onOpen: (appointment: Appointment) => void
}

const NowDivider = ({ now }: { now: number }) => (
  <li data-testid="now-divider" className="flex items-center gap-2 px-3 py-1">
    <span className="h-px flex-1" style={{ background: "var(--now-line)" }} />
    <span
      className="text-xs font-medium tabular-nums"
      style={{ color: "var(--now-line)" }}
    >{`now ${fmtTime(now)}`}</span>
    <span className="h-px flex-1" style={{ background: "var(--now-line)" }} />
  </li>
)

export const AgendaView = ({
  appointments,
  dentists,
  date,
  conflictId = null,
  onOpen
}: AgendaViewProps) => {
  const [filter, setFilter] = useState(ALL_DENTISTS)
  const isToday = date === bkkToday()
  const now = useNow(isToday)

  const dentistNames = useMemo(
    () => new Map(dentists.map((dentist) => [dentist.id, dentist.name])),
    [dentists]
  )

  const rows = useMemo(
    () =>
      appointments
        .filter((a) => filter === ALL_DENTISTS || a.dentistId === filter)
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [appointments, filter]
  )

  const upcoming = rows.findIndex((a) => Date.parse(a.startsAt) > now)
  const dividerAt = !isToday || rows.length === 0 ? -1 : upcoming === -1 ? rows.length : upcoming

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <NativeSelect
          aria-label="Dentist"
          className="h-11 w-auto"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value={ALL_DENTISTS}>All dentists</option>
          {dentists.map((dentist) => (
            <option key={dentist.id} value={dentist.id}>
              {dentist.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={CalendarX} title="Nothing scheduled" hint="Try another day or dentist" />
      ) : (
        <ul data-testid="agenda-list" className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {rows.map((appointment, index) => {
            const start = Date.parse(appointment.startsAt)
            const end = Date.parse(appointment.endsAt)
            const hue = appointment.service.colorIndex % 6
            const cancelled = appointment.status === "cancelled"
            const noShow = appointment.status === "no_show"
            const completed = appointment.status === "completed"
            const conflict = conflictId === appointment.id
            const dentistName = dentistNames.get(appointment.dentistId)

            return (
              <Fragment key={appointment.id}>
                {index === dividerAt ? <NowDivider now={now} /> : null}
                <li>
                  <button
                    type="button"
                    data-testid={`agenda-${appointment.id}`}
                    onClick={() => onOpen(appointment)}
                    className={cn(
                      "flex min-h-11 w-full flex-col items-start gap-0.5 border-l-[3px] px-3 py-2 text-left text-sm text-card-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      completed && "opacity-70",
                      cancelled && "border-l-border bg-muted text-muted-foreground",
                      conflict && "ring-2 ring-inset ring-destructive"
                    )}
                    style={
                      cancelled
                        ? undefined
                        : {
                            borderLeftColor: noShow
                              ? "var(--warning)"
                              : `var(--hue${hue}-border)`
                          }
                    }
                  >
                    <span className="flex w-full items-center gap-1">
                      <span className="font-medium tabular-nums">
                        {fmtTime(start)}–{fmtTime(end)}
                      </span>
                      <span className="ml-auto flex items-center gap-1">
                        {conflict ? (
                          <AlertTriangle className="h-4 w-4 text-destructive" aria-label="Conflict" />
                        ) : null}
                        {appointment.seriesId ? (
                          <Repeat className="h-4 w-4" aria-label="Recurring" />
                        ) : null}
                        {completed ? <Check className="h-4 w-4" aria-label="Completed" /> : null}
                        {noShow ? (
                          <AlertTriangle className="h-4 w-4 text-warning" aria-label="No-show" />
                        ) : null}
                        {cancelled ? <Ban className="h-4 w-4" aria-label="Cancelled" /> : null}
                      </span>
                    </span>
                    <span className={cn("font-medium", cancelled && "line-through")}>
                      {appointment.service.name}
                    </span>
                    <span className="text-muted-foreground">
                      {dentistName
                        ? `${appointment.patient.name} · ${dentistName}`
                        : appointment.patient.name}
                    </span>
                  </button>
                </li>
              </Fragment>
            )
          })}
          {dividerAt === rows.length ? <NowDivider now={now} /> : null}
        </ul>
      )}
    </div>
  )
}
