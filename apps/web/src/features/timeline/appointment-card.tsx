import type { Appointment } from "@dentalops/contracts"
import { AlertTriangle, Ban, Check, Repeat } from "lucide-react"
import { cn } from "../../lib/cn"
import { fmtTime, msToY } from "./lib/geometry"

interface AppointmentCardProps {
  appointment: Appointment
  dayStart: number
  lane: number
  lanes: number
  onClick: (appointment: Appointment) => void
}

export const AppointmentCard = ({
  appointment,
  dayStart,
  lane,
  lanes,
  onClick
}: AppointmentCardProps) => {
  const start = Date.parse(appointment.startsAt)
  const end = Date.parse(appointment.endsAt)
  const top = msToY(start, dayStart)
  const height = Math.max(msToY(end, dayStart) - top, 16)
  const hue = appointment.service.colorIndex % 6
  const cancelled = appointment.status === "cancelled"
  const noShow = appointment.status === "no_show"
  const completed = appointment.status === "completed"

  return (
    <button
      type="button"
      data-testid={`appt-${appointment.id}`}
      onClick={() => onClick(appointment)}
      className={cn(
        "absolute z-[5] flex flex-col items-start overflow-hidden rounded-sm border-l-[3px] px-1.5 py-0.5 text-left text-xs leading-tight text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        completed && "opacity-70",
        cancelled && "border-l-border bg-muted text-muted-foreground"
      )}
      style={{
        top,
        height,
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${(1 / lanes) * 100}% - 4px)`,
        ...(cancelled
          ? {}
          : {
              backgroundColor: `var(--hue${hue}-bg)`,
              borderLeftColor: noShow ? "var(--warning)" : `var(--hue${hue}-border)`
            })
      }}
    >
      <span className="flex w-full items-center gap-1">
        <span className="font-medium tabular-nums">
          {fmtTime(start)}–{fmtTime(end)}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          {appointment.seriesId ? <Repeat className="h-3 w-3" aria-label="Recurring" /> : null}
          {completed ? <Check className="h-3 w-3" aria-label="Completed" /> : null}
          {noShow ? <AlertTriangle className="h-3 w-3 text-warning" aria-label="No-show" /> : null}
          {cancelled ? <Ban className="h-3 w-3" aria-label="Cancelled" /> : null}
        </span>
      </span>
      <span className={cn("truncate font-medium", cancelled && "line-through")}>
        {appointment.service.name}
      </span>
      <span className="truncate text-muted-foreground">{appointment.patient.name}</span>
    </button>
  )
}
