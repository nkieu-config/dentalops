import type { AppointmentStatus } from "@dentalops/contracts"
import { AlertTriangle, Ban, Check, Repeat, UserX } from "lucide-react"
import { appointmentStatus } from "../../lib/appointment-status"
import { cn } from "../../lib/cn"

interface AppointmentStatusMarkProps {
  status: AppointmentStatus
  conflict?: boolean
  recurring?: boolean
  showLabel?: boolean
  className?: string
}

const StatusIcon = ({ status, decorative }: { status: AppointmentStatus; decorative: boolean }) => {
  const accessibility = decorative
    ? { "aria-hidden": true as const }
    : { role: "img", "aria-label": appointmentStatus[status].label }
  const className = "size-3.5 shrink-0"

  if (status === "completed") return <Check className={cn(className, "text-success")} {...accessibility} />
  if (status === "no_show") return <UserX className={cn(className, "text-warning")} {...accessibility} />
  if (status === "cancelled") return <Ban className={cn(className, "text-muted-foreground")} {...accessibility} />
  return null
}

export const AppointmentStatusMark = ({
  status,
  conflict = false,
  recurring = false,
  showLabel = false,
  className
}: AppointmentStatusMarkProps) => {
  const label = appointmentStatus[status].label

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      {conflict ? (
        <AlertTriangle className="size-3.5 text-destructive" role="img" aria-label="Conflict" />
      ) : null}
      {recurring ? <Repeat className="size-3.5" role="img" aria-label="Recurring" /> : null}
      {status !== "confirmed" ? <StatusIcon status={status} decorative={showLabel} /> : null}
      {showLabel && status !== "confirmed" ? (
        <span className="rounded-full bg-background/75 px-1.5 py-0.5 type-meta font-semibold text-muted-foreground">
          {label}
        </span>
      ) : null}
    </span>
  )
}
