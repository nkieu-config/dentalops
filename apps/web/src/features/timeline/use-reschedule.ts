import { appointmentSchema, slotConflictDetailsSchema, type Appointment } from "@dentalops/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"
import { toast } from "sonner"
import { api, ApiError } from "../../lib/api"
import { fmtTime } from "./lib/geometry"

export interface RescheduleInput {
  id: string
  version: number
  startsAt?: string
  dentistId?: string
  durationMin?: number
}

interface RescheduleOptions {
  queryKey: readonly unknown[]
  onConflict?: (conflictingAppointmentId: string | null) => void
  onAnnounce?: (message: string) => void
}

const UNDO_MS = 8000

const durationMinOf = (appointment: Appointment): number =>
  Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60_000)

const movedFrom = (before: Appointment, after: Appointment): boolean =>
  before.startsAt !== after.startsAt ||
  before.dentistId !== after.dentistId ||
  durationMinOf(before) !== durationMinOf(after)

const applyOptimistic = (list: Appointment[], input: RescheduleInput): Appointment[] =>
  list.map((appointment) => {
    if (appointment.id !== input.id) return appointment
    const startsAt = input.startsAt ?? appointment.startsAt
    const durationMs = input.durationMin
      ? input.durationMin * 60_000
      : Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)
    return {
      ...appointment,
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + durationMs).toISOString(),
      dentistId: input.dentistId ?? appointment.dentistId,
      version: appointment.version + 1
    }
  })

export const useRescheduleAppointment = ({
  queryKey,
  onConflict,
  onAnnounce
}: RescheduleOptions) => {
  const queryClient = useQueryClient()
  const busy = useRef(new Set<string>())
  const runRef = useRef<(input: RescheduleInput) => void>(() => {})

  const mutation = useMutation({
    mutationFn: (input: RescheduleInput) =>
      api(`/appointments/${input.id}`, appointmentSchema, {
        method: "PATCH",
        body: {
          version: input.version,
          ...(input.startsAt ? { startsAt: input.startsAt } : {}),
          ...(input.dentistId ? { dentistId: input.dentistId } : {}),
          ...(input.durationMin ? { durationMin: input.durationMin } : {})
        }
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<Appointment[]>(queryKey)
      const before = previous?.find((appointment) => appointment.id === input.id)
      if (previous) queryClient.setQueryData(queryKey, applyOptimistic(previous, input))
      return { previous, before }
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
      if (error instanceof ApiError && error.errorCode === "SLOT_CONFLICT") {
        const details = slotConflictDetailsSchema.safeParse(error.details)
        const conflictId = details.success ? (details.data.conflictingAppointmentId ?? null) : null
        const cached = queryClient.getQueryData<Appointment[]>(queryKey)
        const blocker = conflictId ? cached?.find((a) => a.id === conflictId) : undefined
        toast.error(
          blocker
            ? `Conflicts with ${blocker.patient.name} at ${fmtTime(Date.parse(blocker.startsAt))}`
            : error.message
        )
        onConflict?.(conflictId)
        onAnnounce?.("Conflict — reverted")
        return
      }
      if (error instanceof ApiError && error.errorCode === "STALE_VERSION") {
        toast.error("This appointment was changed by someone else — refreshed")
        onAnnounce?.("Changed elsewhere — refreshed")
        return
      }
      const message = error instanceof ApiError ? error.message : "Could not move the appointment"
      toast.error(message)
      onAnnounce?.(message)
    },
    onSuccess: (updated, _input, context) => {
      const cached = queryClient.getQueryData<Appointment[]>(queryKey)
      if (cached) {
        queryClient.setQueryData(
          queryKey,
          cached.map((a) => (a.id === updated.id ? updated : a))
        )
      }
      onAnnounce?.(`Moved to ${fmtTime(Date.parse(updated.startsAt))}`)
      const before = context?.before
      if (!before || !movedFrom(before, updated)) return
      toast.success(`Moved to ${fmtTime(Date.parse(updated.startsAt))}`, {
        id: `moved-${updated.id}`,
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            runRef.current({
              id: updated.id,
              version: updated.version,
              startsAt: before.startsAt,
              dentistId: before.dentistId,
              durationMin: durationMinOf(before)
            })
        }
      })
    },
    onSettled: (_data, _error, input) => {
      busy.current.delete(input.id)
      void queryClient.invalidateQueries({ queryKey })
    }
  })

  const reschedule = (input: RescheduleInput) => {
    if (busy.current.has(input.id)) return
    busy.current.add(input.id)
    mutation.mutate(input)
  }
  runRef.current = reschedule

  return {
    reschedule,
    isBusy: (id: string) => busy.current.has(id)
  }
}
