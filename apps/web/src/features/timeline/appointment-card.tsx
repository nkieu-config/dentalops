import type { Appointment } from "@dentalops/contracts"
import { AlertTriangle, Ban, Check, Repeat } from "lucide-react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { InitialsAvatar } from "../../components/ui/initials-avatar"
import { cn } from "../../lib/cn"
import { fmtTime, msToY } from "./lib/geometry"

interface AppointmentCardProps {
  appointment: Appointment
  dayStart: number
  lane: number
  lanes: number
  onClick: (appointment: Appointment) => void
  onMoveStart?: (e: ReactPointerEvent<Element>) => void
  onResizeStart?: (e: ReactPointerEvent<Element>) => void
  dimmed?: boolean
  preview?: boolean
  conflict?: boolean
  arrived?: boolean
}

export const AppointmentCard = ({
  appointment,
  dayStart,
  lane,
  lanes,
  onClick,
  onMoveStart,
  onResizeStart,
  dimmed = false,
  preview = false,
  conflict = false,
  arrived = false
}: AppointmentCardProps) => {
  const start = Date.parse(appointment.startsAt)
  const end = Date.parse(appointment.endsAt)
  const top = msToY(start, dayStart)
  const height = Math.max(msToY(end, dayStart) - top, 16)
  const hue = appointment.service.colorIndex % 6
  const cancelled = appointment.status === "cancelled"
  const noShow = appointment.status === "no_show"
  const completed = appointment.status === "completed"
  const roomForPatient = height >= 44
  const roomForService = height >= 30

  return (
    <button
      type="button"
      data-testid={preview ? "drag-preview" : `appt-${appointment.id}`}
      data-appt={preview ? undefined : appointment.id}
      data-dentist={preview ? undefined : appointment.dentistId}
      data-starts={preview ? undefined : appointment.startsAt}
      data-ends={preview ? undefined : appointment.endsAt}
      data-version={preview ? undefined : appointment.version}
      onClick={() => onClick(appointment)}
      onPointerDown={onMoveStart}
      className={cn(
        "group absolute z-5 flex scroll-mb-bottomnav scroll-mt-topbar flex-col items-start overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left text-xs leading-tight text-card-foreground transition-[transform,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !preview && "hover:z-10 hover:-translate-y-0.5 hover:shadow-md",
        completed && "opacity-70",
        cancelled && "border-l-border bg-muted text-muted-foreground",
        conflict && "ring-2 ring-destructive",
        dimmed && "opacity-40",
        arrived && "appointment-arrive",
        preview && "pointer-events-none z-10 shadow-lg"
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
          {conflict ? (
            <AlertTriangle className="h-3 w-3 text-destructive" role="img" aria-label="Conflict" />
          ) : null}
          {appointment.seriesId ? (
            <Repeat className="h-3 w-3" role="img" aria-label="Recurring" />
          ) : null}
          {completed ? <Check className="h-3 w-3" role="img" aria-label="Completed" /> : null}
          {noShow ? (
            <AlertTriangle className="h-3 w-3 text-warning" role="img" aria-label="No-show" />
          ) : null}
          {cancelled ? <Ban className="h-3 w-3" role="img" aria-label="Cancelled" /> : null}
        </span>
      </span>
      <span
        className={cn(
          "w-full truncate font-medium",
          cancelled && "line-through",
          !roomForService && "sr-only"
        )}
      >
        {appointment.service.name}
      </span>
      <span
        className={cn(
          "flex w-full min-w-0 items-center gap-1",
          !cancelled && "text-appointment-muted",
          !roomForPatient && "sr-only"
        )}
      >
        <span aria-hidden="true">
          <InitialsAvatar name={appointment.patient.name} className="size-4 text-[8px]" />
        </span>
        <span className="truncate">{appointment.patient.name}</span>
      </span>
      {onResizeStart ? (
        <span
          data-testid={`resize-${appointment.id}`}
          onPointerDown={onResizeStart}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize items-end justify-center pb-0.5"
        >
          <span className="flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-70">
            <span className="size-0.75 rounded-full bg-current" />
            <span className="size-0.75 rounded-full bg-current" />
            <span className="size-0.75 rounded-full bg-current" />
          </span>
        </span>
      ) : null}
    </button>
  )
}
