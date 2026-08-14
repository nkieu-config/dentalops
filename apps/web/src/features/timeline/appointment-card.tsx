import type { Appointment } from "@dentalops/contracts"
import type { PointerEvent as ReactPointerEvent } from "react"
import { cn } from "../../lib/cn"
import { fmtTime, msToY } from "./lib/geometry"
import { appointmentHue } from "../../lib/appointment-hue"
import { AppointmentStatusMark } from "./appointment-status-mark"
import { appointmentStatus } from "../../lib/appointment-status"

interface AppointmentCardProps {
  appointment: Appointment
  dentistName?: string
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
  selected?: boolean
  contentDensity?: "auto" | "compact"
  interactionHintId?: string
}

export const AppointmentCard = ({
  appointment,
  dentistName,
  dayStart,
  lane,
  lanes,
  onClick,
  onMoveStart,
  onResizeStart,
  dimmed = false,
  preview = false,
  conflict = false,
  arrived = false,
  selected = false,
  contentDensity = "auto",
  interactionHintId
}: AppointmentCardProps) => {
  const start = Date.parse(appointment.startsAt)
  const end = Date.parse(appointment.endsAt)
  const top = msToY(start, dayStart)
  const height = Math.max(msToY(end, dayStart) - top, 16)
  const hue = appointmentHue(appointment.service.colorIndex)
  const cancelled = appointment.status === "cancelled"
  const density =
    contentDensity === "compact" || height < 48 || lanes >= 3
      ? "compact"
      : height < 72 || lanes === 2
        ? "medium"
        : "full"
  const hasRoomForFullDetails = density === "full"
  const timeRange = `${fmtTime(start)}–${fmtTime(end)}`
  const useStartTimeOnly = density === "compact" && !preview
  const accessibleSummary = [
    timeRange,
    appointment.patient.name,
    dentistName,
    appointment.service.name,
    appointmentStatus[appointment.status].label
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <button
      type="button"
      data-testid={preview ? "drag-preview" : `appt-${appointment.id}`}
      data-density={density}
      data-time-format={useStartTimeOnly ? "start" : "range"}
      data-appt={preview ? undefined : appointment.id}
      data-dentist={preview ? undefined : appointment.dentistId}
      data-starts={preview ? undefined : appointment.startsAt}
      data-ends={preview ? undefined : appointment.endsAt}
      data-version={preview ? undefined : appointment.version}
      aria-label={accessibleSummary}
      aria-describedby={interactionHintId}
      aria-keyshortcuts={
        interactionHintId
          ? "Shift+ArrowUp Shift+ArrowDown Shift+ArrowLeft Shift+ArrowRight"
          : undefined
      }
      onClick={() => onClick(appointment)}
      onPointerDown={onMoveStart}
      className={cn(
        "group absolute z-5 flex scroll-mb-bottomnav scroll-mt-gridheader flex-col items-start overflow-hidden rounded-timeline-appointment border-l-[3px] px-2 py-1 text-left type-dense leading-tight text-card-foreground transition-[box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        !preview && "hover:z-10 hover:shadow-(--shadow-appointment-hover)",
        cancelled && "border-l-border bg-muted text-muted-foreground",
        selected && "z-15 outline outline-2 outline-offset-[-2px] outline-primary",
        dimmed && "opacity-40",
        arrived && "appointment-arrive",
        preview && "pointer-events-none z-30 ring-2 ring-primary/50 shadow-lg"
      )}
      style={{
        top,
        height,
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${(1 / lanes) * 100}% - 4px)`,
        ...(cancelled ? {} : { backgroundColor: hue.background, borderLeftColor: hue.border })
      }}
    >
      <span className="flex w-full items-center gap-1">
        <span className="font-medium tabular-nums" aria-label={timeRange}>
          <span aria-hidden="true">{useStartTimeOnly ? fmtTime(start) : timeRange}</span>
          {useStartTimeOnly ? <span className="sr-only">{timeRange}</span> : null}
        </span>
        {!hasRoomForFullDetails ? <span className="min-w-0 flex-1 truncate font-medium">{appointment.patient.name}</span> : null}
        <AppointmentStatusMark
          className="ml-auto"
          status={appointment.status}
          conflict={conflict}
          recurring={Boolean(appointment.seriesId)}
        />
      </span>
      {hasRoomForFullDetails ? (
        <>
          <span className={cn("flex w-full min-w-0 items-center", !cancelled && "text-appointment-muted")}>
            <span className="truncate" title={appointment.patient.name}>{appointment.patient.name}</span>
          </span>
          <span className={cn("w-full truncate font-medium", cancelled && "line-through")} title={appointment.service.name}>
            {appointment.service.name}
          </span>
        </>
      ) : density === "medium" ? (
        <span className={cn("w-full truncate font-medium", cancelled && "line-through")} title={appointment.service.name}>
          {appointment.service.name}
        </span>
      ) : (
        <span className={cn("sr-only", cancelled && "line-through")}>{appointment.service.name}</span>
      )}
      {onResizeStart ? (
        <span
          data-testid={`resize-${appointment.id}`}
          onPointerDown={onResizeStart}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 flex h-4 cursor-ns-resize items-end justify-center pb-0.5"
        >
          <span
            className={cn(
              "flex gap-0.5 transition-opacity duration-150 group-hover:opacity-70 group-focus-within:opacity-70",
              density === "compact" ? "opacity-0" : "opacity-30"
            )}
          >
            <span className="size-0.75 rounded-full bg-current" />
            <span className="size-0.75 rounded-full bg-current" />
            <span className="size-0.75 rounded-full bg-current" />
          </span>
        </span>
      ) : null}
    </button>
  )
}
