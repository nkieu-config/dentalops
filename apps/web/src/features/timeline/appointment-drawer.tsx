import { appointmentSchema, type Appointment, type StaffMember } from "@dentalops/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { SlotPicker } from "../../components/slot-picker"
import { AlertDialog } from "../../components/ui/alert-dialog"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { InitialsAvatar } from "../../components/ui/initials-avatar"
import { Label } from "../../components/ui/label"
import { Sheet } from "../../components/ui/sheet"
import { OFFLINE_MESSAGE } from "../../components/shell/offline-banner"
import { api } from "../../lib/api"
import { useCanBook } from "../../lib/session"
import { useOnline } from "../../lib/use-online"
import { bkkDate, fmtDay, fmtTime } from "./lib/geometry"
import { SeriesBadge, SeriesDialog } from "./series-dialog"
import type { RescheduleInput } from "./use-reschedule"
import {
  appointmentStatus,
  appointmentStatusChange,
  type AppointmentStatusChange
} from "../../lib/appointment-status"
import { queryKeys } from "../../lib/query-keys"

const OFFLINE_REASON_ID = "appointment-drawer-offline-reason"

interface AppointmentDrawerProps {
  appointment: Appointment | null
  dentists?: StaffMember[]
  chairName?: string
  branchName?: string
  onClose: () => void
  onReschedule?: (input: RescheduleInput) => void
  onBookFollowUp?: (appointment: Appointment) => void
}

const Meta = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 space-y-0.5">
    <p className="type-meta font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="break-words type-ui">{value}</p>
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
  onPick: (startsAt: string) => void
}

const MoveSection = ({ appointment, onPick }: MoveSectionProps) => {
  const [date, setDate] = useState(() => bkkDate(Date.parse(appointment.startsAt)))
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <Label>Choose a new time</Label>
      <SlotPicker
        serviceId={appointment.serviceId}
        branchId={appointment.branchId}
        dentistId={appointment.dentistId}
        date={date}
        onDateChange={setDate}
        onPick={onPick}
      />
    </div>
  )
}

export const AppointmentDrawer = ({
  appointment,
  dentists,
  chairName,
  branchName,
  onClose,
  onReschedule,
  onBookFollowUp
}: AppointmentDrawerProps) => {
  const queryClient = useQueryClient()
  const online = useOnline()
  const canMove = useCanBook() && online
  const [seriesOpen, setSeriesOpen] = useState(false)
  const [statusToConfirm, setStatusToConfirm] = useState<AppointmentStatusChange | null>(null)
  const [moveStartsAt, setMoveStartsAt] = useState<string | null>(null)
  const [moveOpen, setMoveOpen] = useState(false)
  const recurring = canMove && appointment?.status === "confirmed" && Boolean(appointment.seriesId)
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatusChange }) =>
      api(`/appointments/${id}/status`, appointmentSchema, { method: "PATCH", body: { status } }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.root() })
      toast.success(`Marked ${appointmentStatus[updated.status].label.toLowerCase()}`)
      onClose()
    },
    onError: () => undefined
  })

  useEffect(() => {
    setMoveOpen(false)
    setMoveStartsAt(null)
  }, [appointment?.id])

  const closeAll = () => {
    setSeriesOpen(false)
    setStatusToConfirm(null)
    setMoveStartsAt(null)
    setMoveOpen(false)
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
        mobileLayout={appointment?.status === "confirmed" ? "full" : "adaptive"}
        footer={moveStartsAt && appointment && onReschedule ? <Button className="w-full" onClick={() => { onReschedule({ id: appointment.id, version: appointment.version, startsAt: moveStartsAt }); onClose() }}>Confirm new time</Button> : undefined}
      >
        {appointment ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span aria-hidden="true">
                <InitialsAvatar name={appointment.patient.name} className="size-11 type-body" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 break-words type-card-title font-semibold" title={appointment.service.name}>{appointment.service.name}</h3>
                  <Badge tone={appointmentStatus[appointment.status].tone}>
                    {appointmentStatus[appointment.status].label}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 type-ui">
                  <a className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={`tel:${appointment.patient.phone}`}>
                    {appointment.patient.phone}
                  </a>
                  <a className="font-medium text-primary underline-offset-4 hover:underline" href={`/app/patients/${appointment.patientId}`}>
                    View patient
                  </a>
                </div>
              </div>
            </div>
            <div
              data-testid="appointment-meta"
              className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4"
            >
              <Meta label="Date" value={fmtDay(bkkDate(Date.parse(appointment.startsAt)))} />
              <Meta
                label="Time"
                value={`${fmtTime(Date.parse(appointment.startsAt))}–${fmtTime(Date.parse(appointment.endsAt))} (${fmtDuration(appointment.startsAt, appointment.endsAt)})`}
              />
              <Meta
                label="Branch"
                value={branchName ?? "—"}
              />
              <Meta
                label="Dentist"
                value={dentists?.find((d) => d.id === appointment.dentistId)?.name ?? "—"}
              />
              <Meta label="Chair" value={chairName ?? "—"} />
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
                    onClick={() => setStatusToConfirm("completed")}
                  >
                    Complete
                  </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={setStatus.isPending || !online}
                  aria-describedby={online ? undefined : OFFLINE_REASON_ID}
                  onClick={() => setStatusToConfirm("no_show")}
                >
                  No-show
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={setStatus.isPending || !online}
                  aria-describedby={online ? undefined : OFFLINE_REASON_ID}
                  onClick={() => setStatusToConfirm("cancelled")}
                >
                    Cancel
                  </Button>
                  {canMove && onReschedule && !recurring ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-expanded={moveOpen}
                      onClick={() => {
                        setMoveOpen((open) => !open)
                        setMoveStartsAt(null)
                      }}
                    >
                      Reschedule
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {appointment.status !== "confirmed" ? (
              <div data-testid="closed-appointment" className="space-y-2 border-t border-border pt-4">
                <p className="type-supporting text-muted-foreground">
                  {appointmentStatus[appointment.status].closedNote}
                </p>
                {canMove && onBookFollowUp ? (
                  <Button size="sm" variant="secondary" onClick={() => onBookFollowUp(appointment)}>
                    Book a follow-up
                  </Button>
                ) : null}
              </div>
            ) : null}
            {appointment.status === "confirmed" && !online ? (
              <p id={OFFLINE_REASON_ID} className="type-ui text-muted-foreground">
                {OFFLINE_MESSAGE}
              </p>
            ) : null}
            {appointment.status === "confirmed" && canMove && onReschedule && !recurring && moveOpen ? (
              <MoveSection
                key={appointment.id}
                appointment={appointment}
                onPick={setMoveStartsAt}
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
        open={statusToConfirm !== null}
        onOpenChange={(open) => { if (!open) setStatusToConfirm(null) }}
        title={statusToConfirm ? appointmentStatusChange[statusToConfirm].title : ""}
        description={
          appointment && statusToConfirm
            ? appointmentStatusChange[statusToConfirm].describe(
                appointment.patient.name,
                appointment.service.name
              )
            : ""
        }
        confirmLabel={statusToConfirm ? appointmentStatusChange[statusToConfirm].confirmLabel : ""}
        confirmVariant={
          statusToConfirm ? appointmentStatusChange[statusToConfirm].confirmVariant : "destructive"
        }
        cancelLabel="Keep appointment"
        onConfirm={async () => {
          if (!appointment || !statusToConfirm) return
          await setStatus.mutateAsync({ id: appointment.id, status: statusToConfirm })
        }}
      />
    </>
  )
}
