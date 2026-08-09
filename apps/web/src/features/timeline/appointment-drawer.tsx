import { appointmentSchema, type Appointment, type AppointmentStatus } from "@dentalops/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { SlotPicker } from "../../components/slot-picker"
import { AlertDialog } from "../../components/ui/alert-dialog"
import { Button } from "../../components/ui/button"
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

interface AppointmentDrawerProps {
  appointment: Appointment | null
  onClose: () => void
  onReschedule?: (input: RescheduleInput) => void
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    <p className="text-sm">{value}</p>
  </div>
)

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
        title={appointment?.service.name ?? ""}
      >
        {appointment ? (
          <div className="space-y-4">
            <Row
              label="Time"
              value={`${fmtTime(Date.parse(appointment.startsAt))}–${fmtTime(Date.parse(appointment.endsAt))}`}
            />
            <Row
              label="Patient"
              value={`${appointment.patient.name} · ${appointment.patient.phone}`}
            />
            <Row label="Status" value={appointment.status.replace("_", "-")} />
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
