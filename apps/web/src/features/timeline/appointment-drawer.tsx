import { appointmentSchema, type Appointment, type AppointmentStatus } from "@dentalops/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "../../components/ui/button"
import { Label } from "../../components/ui/label"
import { Sheet } from "../../components/ui/sheet"
import { api, ApiError } from "../../lib/api"
import { fmtTime } from "./lib/geometry"

interface AppointmentDrawerProps {
  appointment: Appointment | null
  onClose: () => void
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    <p className="text-sm">{value}</p>
  </div>
)

export const AppointmentDrawer = ({ appointment, onClose }: AppointmentDrawerProps) => {
  const queryClient = useQueryClient()
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
        </div>
      ) : null}
    </Sheet>
  )
}
