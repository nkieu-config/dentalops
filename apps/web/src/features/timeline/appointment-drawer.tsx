import { appointmentSchema, type Appointment, type AppointmentStatus } from "@dentalops/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { SlotPicker } from "../../components/slot-picker"
import { Button } from "../../components/ui/button"
import { Label } from "../../components/ui/label"
import { Sheet } from "../../components/ui/sheet"
import { api, ApiError } from "../../lib/api"
import { useCanBook } from "../../lib/session"
import { bkkDate, fmtTime } from "./lib/geometry"
import type { RescheduleInput } from "./use-reschedule"

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
  const canMove = useCanBook()
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

  return (
    <Sheet
      open={appointment !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
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
          {appointment.status === "confirmed" ? (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: appointment.id, status: "completed" })}
              >
                Complete
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: appointment.id, status: "no_show" })}
              >
                No-show
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: appointment.id, status: "cancelled" })}
              >
                Cancel
              </Button>
            </div>
          ) : null}
          {appointment.status === "confirmed" && canMove && onReschedule ? (
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
  )
}
