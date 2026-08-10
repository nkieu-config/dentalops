import {
  appointmentSchema,
  type Appointment,
  type AppointmentStatus,
  type StaffMember
} from "@dentalops/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { SlotPicker } from "../../components/slot-picker"
import { AlertDialog } from "../../components/ui/alert-dialog"
import { Badge, type BadgeTone } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { InitialsAvatar } from "../../components/ui/initials-avatar"
import { Label } from "../../components/ui/label"
import { Sheet } from "../../components/ui/sheet"
import { OFFLINE_MESSAGE } from "../../components/shell/offline-banner"
import { api, ApiError } from "../../lib/api"
import { useCanBook } from "../../lib/session"
import { useOnline } from "../../lib/use-online"
import { bkkDate, fmtTime } from "./lib/geometry"
import { SeriesBadge, SeriesDialog } from "./series-dialog"
import type { RescheduleInput } from "./use-reschedule"

const OFFLINE_REASON_ID = "appointment-drawer-offline-reason"

const STATUS_WORDS: Record<AppointmentStatus, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show"
}

const STATUS_TONES: Record<AppointmentStatus, BadgeTone> = {
  confirmed: "success",
  completed: "success",
  cancelled: "destructive",
  no_show: "warning"
}

interface AppointmentDrawerProps {
  appointment: Appointment | null
  dentists?: StaffMember[]
  onClose: () => void
  onReschedule?: (input: RescheduleInput) => void
}

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-0.5">
    <p className="text-meta font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm">{value}</p>
  </div>
)

const fmtDuration = (startsAt: string, endsAt: string): string => {
  const minutes = Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

interface MoveSectionProps {
  appointment: Appointment
  onReschedule: (input: RescheduleInput) => void
  onClose: () => void
}

const MoveSection = ({ appointment, onReschedule, onClose }: MoveSectionProps) => {
  const [date, setDate] = useState(() => bkkDate(Date.parse(appointment.startsAt)))
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <Label>Move</Label>
      <SlotPicker
        serviceId={appointment.serviceId}
        branchId={appointment.branchId}
        dentistId={appointment.dentistId}
        date={date}
        onDateChange={setDate}
        onPick={(startsAt) => {
          onReschedule({ id: appointment.id, version: appointment.version, startsAt })
          onClose()
        }}
      />
    </div>
  )
}

export const AppointmentDrawer = ({
  appointment,
  dentists,
  onClose,
  onReschedule
}: AppointmentDrawerProps) => {
  const queryClient = useQueryClient()
  const online = useOnline()
  const canMove = useCanBook() && online
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const recurring = canMove && appointment?.status === "confirmed" && Boolean(appointment.seriesId)
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      api(`/appointments/${id}/status`, appointmentSchema, { method: "PATCH", body: { status } }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ["appointments"] })
      toast.success(`Marked ${updated.status.replace("_", "-")}`)
      onClose()
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Something went wrong")
  })

  const closeAll = () => {
    setSeriesOpen(false)
    setCancelling(false)
    onClose()
  }

  return (
    <>
      <Sheet
        open={appointment !== null && !seriesOpen}
        onOpenChange={(open) => {
          if (!open) closeAll()
        }}
        title={appointment?.patient.name ?? ""}
      >
        {appointment ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <InitialsAvatar name={appointment.patient.name} className="size-11 text-base" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-card-title font-bold">{appointment.service.name}</h3>
                  <Badge tone={STATUS_TONES[appointment.status]}>
                    {STATUS_WORDS[appointment.status]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{appointment.patient.phone}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4">
              <Meta
                label="Time"
                value={`${fmtTime(Date.parse(appointment.startsAt))}–${fmtTime(Date.parse(appointment.endsAt))} (${fmtDuration(appointment.startsAt, appointment.endsAt)})`}
              />
              <Meta
                label="Dentist"
                value={dentists?.find((d) => d.id === appointment.dentistId)?.name ?? "—"}
              />
            </div>
            {recurring ? <SeriesBadge onOpen={() => setSeriesOpen(true)} /> : null}
            {appointment.status === "confirmed" ? (
              <div className="space-y-2 border-t border-border pt-4">
                <Label>Visit actions</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={setStatus.isPending || !online}
                    aria-describedby={online ? undefined : OFFLINE_REASON_ID}
                    onClick={() => setStatus.mutate({ id: appointment.id, status: "completed" })}
                  >
                    Complete
                  </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={setStatus.isPending || !online}
                  aria-describedby={online ? undefined : OFFLINE_REASON_ID}
                  onClick={() => setStatus.mutate({ id: appointment.id, status: "no_show" })}
                >
                  No-show
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={setStatus.isPending || !online}
                  aria-describedby={online ? undefined : OFFLINE_REASON_ID}
                  onClick={() => setCancelling(true)}
                >
                  Cancel
                </Button>
                </div>
              </div>
            ) : null}
            {appointment.status === "confirmed" && !online ? (
              <p id={OFFLINE_REASON_ID} className="text-sm text-muted-foreground">
                {OFFLINE_MESSAGE}
              </p>
            ) : null}
            {appointment.status === "confirmed" && canMove && onReschedule && !recurring ? (
              <MoveSection
                key={appointment.id}
                appointment={appointment}
                onReschedule={onReschedule}
                onClose={onClose}
              />
            ) : null}
          </div>
        ) : null}
      </Sheet>
      <SeriesDialog
        key={appointment?.id}
        appointment={seriesOpen ? appointment : null}
        onClose={closeAll}
      />
      <AlertDialog
        open={cancelling}
        onOpenChange={(open) => { if (!open) setCancelling(false) }}
        title="Cancel appointment?"
        description={
          appointment
            ? `Cancel ${appointment.patient.name}'s ${appointment.service.name} appointment? Booking history is retained, but this can't be undone from here.`
            : ""
        }
        confirmLabel="Cancel appointment"
        cancelLabel="Keep appointment"
        onConfirm={() => {
          setCancelling(false)
          if (appointment) setStatus.mutate({ id: appointment.id, status: "cancelled" })
        }}
      />
    </>
  )
}
