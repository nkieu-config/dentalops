import {
  appointmentSeriesSchema,
  seriesConflictDetailsSchema,
  type Appointment,
  type EditScope,
  type SeriesConflict
} from "@dentalops/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { OctagonAlert, Repeat } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { SlotPicker } from "../../components/slot-picker"
import { Button } from "../../components/ui/button"
import { Label } from "../../components/ui/label"
import { Sheet } from "../../components/ui/sheet"
import { api, ApiError } from "../../lib/api"
import { bkkDate, fmtDay, fmtTime } from "./lib/geometry"
import { queryKeys } from "../../lib/query-keys"

const SCOPES: Array<{ value: EditScope; label: string }> = [
  { value: "this", label: "This appointment" },
  { value: "following", label: "This and following" },
  { value: "all", label: "All appointments" }
]

const REASONS: Record<string, string> = {
  SLOT_CONFLICT: "the dentist is already booked",
  RESOURCE_UNAVAILABLE: "no chair or equipment is free"
}

export const SeriesConflictList = ({ conflicts }: { conflicts: SeriesConflict[] }) =>
  conflicts.length === 0 ? null : (
    <div
      data-testid="series-conflicts"
      className="rounded-md border border-destructive bg-destructive-surface p-3 text-destructive-on-surface"
    >
      <h3 className="flex items-center gap-1.5 type-ui font-semibold">
        <OctagonAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Nothing was saved — <span className="tabular-nums">{conflicts.length}</span>{" "}
          {conflicts.length === 1 ? "occurrence conflicts" : "occurrences conflict"}
        </span>
      </h3>
      <ul className="mt-2 space-y-1.5">
        {conflicts.map((conflict) => {
          const at = Date.parse(conflict.startsAt)
          return (
            <li key={conflict.startsAt} className="flex items-start gap-2 type-ui">
              <OctagonAlert className="mt-0.5 h-4 w-4 shrink-0" role="img" aria-label="Conflict" />
              <span>
                <span className="font-medium tabular-nums">
                  {fmtDay(bkkDate(at))} {fmtTime(at)}
                </span>
                <span className="text-muted-foreground">
                  {" — "}
                  {REASONS[conflict.reason] ?? conflict.reason}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )

export const readSeriesConflicts = (error: unknown): SeriesConflict[] => {
  if (!(error instanceof ApiError) || error.errorCode !== "SERIES_CONFLICT") return []
  const parsed = seriesConflictDetailsSchema.safeParse(error.details)
  return parsed.success ? parsed.data.conflicts : []
}

interface SeriesDialogProps {
  appointment: Appointment | null
  onClose: () => void
}

export const SeriesDialog = ({ appointment, onClose }: SeriesDialogProps) => {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<EditScope>("this")
  const [date, setDate] = useState(() =>
    bkkDate(Date.parse(appointment?.startsAt ?? new Date().toISOString()))
  )
  const [conflicts, setConflicts] = useState<SeriesConflict[]>([])
  const [selectedStartsAt, setSelectedStartsAt] = useState<string | null>(null)

  const edit = useMutation({
    mutationFn: ({ seriesId, startsAt }: { seriesId: string; startsAt: string }) =>
      api(`/series/${seriesId}`, appointmentSeriesSchema, {
        method: "PATCH",
        body: {
          scope,
          fromAppointmentId: appointment?.id,
          version: appointment?.version,
          startsAt
        }
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.root() })
      setConflicts([])
      toast.success(scope === "this" ? "Occurrence moved" : "Series moved")
      onClose()
    },
    onError: (error) => {
      const found = readSeriesConflicts(error)
      setConflicts(found)
      if (found.length > 0) return
      toast.error(error instanceof ApiError ? error.message : "Could not move the series")
    }
  })

  return (
    <Sheet
      open={appointment !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Repeating appointment"
      footer={<Button type="button" className="w-full" disabled={!selectedStartsAt || edit.isPending} onClick={() => { if (appointment?.seriesId && selectedStartsAt) edit.mutate({ seriesId: appointment.seriesId, startsAt: selectedStartsAt }) }}>{edit.isPending ? "Moving…" : "Confirm move"}</Button>}
    >
      {appointment && appointment.seriesId ? (
        <div className="space-y-4">
          <fieldset className="space-y-1">
            <legend className="mb-1 type-ui font-medium">Apply the move to</legend>
            {SCOPES.map((option) => (
              <label
                key={option.value}
                className="flex min-h-11 items-center gap-2 type-ui"
                htmlFor={`series-scope-${option.value}`}
              >
                <input
                  id={`series-scope-${option.value}`}
                  type="radio"
                  name="series-scope"
                  className="h-4 w-4"
                  value={option.value}
                  checked={scope === option.value}
                  onChange={() => setScope(option.value)}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <div className="space-y-2 border-t border-border pt-4">
            <Label>Move to</Label>
            <SlotPicker
              serviceId={appointment.serviceId}
              branchId={appointment.branchId}
              dentistId={appointment.dentistId}
              date={date}
              onDateChange={setDate}
              onPick={setSelectedStartsAt}
            />
          </div>
          {selectedStartsAt ? <p className="rounded-md bg-surface-subtle p-3 type-ui text-muted-foreground">New time: <span className="font-medium text-foreground">{fmtDay(bkkDate(Date.parse(selectedStartsAt)))} {fmtTime(Date.parse(selectedStartsAt))}</span></p> : null}
          <SeriesConflictList conflicts={conflicts} />
        </div>
      ) : null}
    </Sheet>
  )
}

export const SeriesBadge = ({ onOpen }: { onOpen: () => void }) => (
  <button
    type="button"
    data-testid="series-badge"
    onClick={onOpen}
    className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-border px-3 type-ui font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <Repeat className="h-4 w-4" aria-hidden="true" />
    Repeats — edit series
  </button>
)
