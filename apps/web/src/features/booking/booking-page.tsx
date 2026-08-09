import type { AvailabilitySlot } from "@dentalops/contracts"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ShieldOff } from "lucide-react"
import { useEffect, useMemo, useReducer, useRef } from "react"
import { useParams } from "react-router"
import { toast } from "sonner"
import type { SlotPickerState } from "../../components/slot-picker"
import { EmptyState } from "../../components/ui/empty-state"
import { Skeleton } from "../../components/ui/skeleton"
import { ApiError } from "../../lib/api"
import { bkkToday } from "../timeline/lib/geometry"
import {
  AVAILABILITY_KEY,
  useClinic,
  useConfirmBooking,
  useCreateHold,
  usePublicAvailability,
  useReleaseHold
} from "./hooks"
import { ConfirmedStep } from "./steps/confirmed-step"
import { DentistStep } from "./steps/dentist-step"
import { DetailsStep } from "./steps/details-step"
import { ServiceStep } from "./steps/service-step"
import { SlotStep } from "./steps/slot-step"
import {
  STEP_ORDER,
  initialWizardState,
  wizardReducer,
  type RecoveryReason,
  type WizardStep
} from "./wizard-reducer"

const STEP_LABELS: Record<WizardStep, string> = {
  service: "Service",
  dentist: "Dentist",
  slot: "Time",
  details: "Details",
  confirmed: "Confirmed"
}

export const BookingPage = () => {
  const { clinicSlug = "" } = useParams()
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(wizardReducer, bkkToday(), initialWizardState)

  const clinic = useClinic(clinicSlug)
  const createHold = useCreateHold(clinicSlug)
  const releaseHold = useReleaseHold(clinicSlug)
  const confirmBooking = useConfirmBooking(clinicSlug)

  const availability = usePublicAvailability({
    clinicSlug,
    serviceId: state.serviceId,
    branchId: state.branchId,
    dentistId: state.dentistId,
    date: state.date,
    enabled: state.step === "slot"
  })

  useEffect(() => {
    const first = clinic.data?.branches[0]
    if (first && state.branchId === null) dispatch({ type: "choose-branch", branchId: first.id })
  }, [clinic.data, state.branchId])

  const stateRef = useRef(state)
  stateRef.current = state
  const releaseHoldRef = useRef(releaseHold.mutate)
  releaseHoldRef.current = releaseHold.mutate

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      const current = stateRef.current
      if (current.hold && current.step !== "confirmed") {
        event.preventDefault()
        event.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", warnBeforeLeaving)
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving)
      const current = stateRef.current
      if (current.hold && current.step !== "confirmed") {
        releaseHoldRef.current(current.hold.holdId)
      }
    }
  }, [])

  const slotsByStart = useMemo(() => {
    const byStart = new Map<string, AvailabilitySlot>()
    for (const slot of availability.data?.slots ?? []) {
      if (!byStart.has(slot.startsAt)) byStart.set(slot.startsAt, slot)
    }
    return byStart
  }, [availability.data])

  const pickerState = useMemo<SlotPickerState>(() => {
    if (availability.isPending) return { status: "loading" }
    if (availability.isError) return { status: "error" }
    return {
      status: "ready",
      slots: [...slotsByStart.values()].sort(
        (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)
      )
    }
  }, [availability.isPending, availability.isError, slotsByStart])

  const recap = useMemo(() => {
    if (!state.hold) return null
    return {
      serviceName: clinic.data?.services.find((s) => s.id === state.serviceId)?.name ?? "Selected service",
      dentistName: clinic.data?.dentists.find((d) => d.id === state.hold?.dentistId)?.name ?? "Assigned dentist",
      branchName: clinic.data?.branches.find((b) => b.id === state.branchId)?.name ?? "Clinic"
    }
  }, [clinic.data, state.serviceId, state.branchId, state.hold])

  const nearestFree = useMemo(() => {
    if (!state.recovery) return null
    const lost = Date.parse(state.recovery.startsAt)
    const later = [...slotsByStart.keys()]
      .filter((startsAt) => Date.parse(startsAt) >= lost)
      .sort((a, b) => Date.parse(a) - Date.parse(b))
    return later[0] ?? null
  }, [state.recovery, slotsByStart])

  const refreshSlots = () => {
    void queryClient.invalidateQueries({ queryKey: [AVAILABILITY_KEY] })
  }

  const loseHold = (reason: RecoveryReason) => {
    dispatch({ type: "lose-hold", reason })
    refreshSlots()
  }

  const pickSlot = (startsAt: string) => {
    const slot = slotsByStart.get(startsAt)
    if (!slot || !state.serviceId || !state.branchId || createHold.isPending) return
    createHold.mutate(
      {
        serviceId: state.serviceId,
        branchId: state.branchId,
        dentistId: slot.dentistId,
        startsAt
      },
      {
        onSuccess: (hold) =>
          dispatch({
            type: "hold-acquired",
            hold: { ...hold, startsAt, dentistId: slot.dentistId }
          }),
        onError: (error) => {
          toast.error(
            error instanceof ApiError && error.errorCode === "SLOT_HELD"
              ? "Someone else is booking that time right now"
              : "Could not hold that time"
          )
          refreshSlots()
        }
      }
    )
  }

  const goBack = () => {
    if (state.step === "details" && state.hold) {
      releaseHold.mutate(state.hold.holdId, { onSettled: refreshSlots })
    }
    dispatch({ type: "back" })
  }

  const submitDetails = () => {
    if (!state.hold) return
    const email = state.details.email.trim()
    confirmBooking.mutate(
      {
        holdId: state.hold.holdId,
        name: state.details.name.trim(),
        phone: state.details.phone.trim(),
        ...(email ? { email } : {})
      },
      {
        onSuccess: (booking) => dispatch({ type: "booked", booking }),
        onError: (error) => {
          if (error instanceof ApiError && error.errorCode === "SLOT_CONFLICT") {
            loseHold("taken")
            return
          }
          if (error instanceof ApiError && error.errorCode === "HOLD_EXPIRED") {
            loseHold("expired")
            return
          }
          toast.error(error instanceof ApiError ? error.message : "Booking failed")
        }
      }
    )
  }

  const stepIndex = STEP_ORDER.indexOf(state.step)

  if (clinic.isError) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-4 text-base">
        <EmptyState
          icon={ShieldOff}
          title="Clinic not found"
          hint="Check the link your clinic sent you"
        />
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 text-base">
      <header className="-mx-4 -mt-4 space-y-3 border-b border-border bg-card px-4 pb-3 pt-4">
        <div className="flex min-h-11 items-center gap-2">
          {stepIndex > 0 ? (
            <button
              type="button"
              aria-label="Back"
              onClick={goBack}
              className="-ml-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          ) : null}
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
            {clinic.isPending ? <Skeleton className="h-6 w-40" /> : clinic.data?.name}
          </h1>
        </div>
        {state.step === "confirmed" ? null : (
          <ol
            aria-label={`Booking steps, step ${stepIndex + 1} of ${STEP_ORDER.length}`}
            className="flex items-stretch gap-2"
          >
            {STEP_ORDER.map((step, index) => {
              const status = index < stepIndex ? "done" : index === stepIndex ? "current" : "upcoming"
              return (
                <li key={step} className="flex flex-1 flex-col items-center gap-1.5">
                  <span
                    aria-hidden
                    className={
                      status === "upcoming"
                        ? "h-1.5 w-full rounded-full bg-border transition-colors duration-150"
                        : "h-1.5 w-full rounded-full bg-primary transition-colors duration-150"
                    }
                  />
                  <span
                    aria-current={status === "current" ? "step" : undefined}
                    className={
                      status === "upcoming"
                        ? "text-muted-foreground"
                        : status === "current"
                          ? "font-semibold text-foreground"
                          : "text-foreground"
                    }
                  >
                    {STEP_LABELS[step]}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </header>

      {state.step === "service" ? (
        <ServiceStep
          branches={clinic.data?.branches ?? []}
          services={clinic.data?.services ?? []}
          branchId={state.branchId}
          loading={clinic.isPending}
          onChooseBranch={(branchId) => dispatch({ type: "choose-branch", branchId })}
          onChooseService={(serviceId) => dispatch({ type: "choose-service", serviceId })}
        />
      ) : null}

      {state.step === "dentist" ? (
        <DentistStep
          dentists={clinic.data?.dentists ?? []}
          onChoose={(dentistId) => dispatch({ type: "choose-dentist", dentistId })}
        />
      ) : null}

      {state.step === "slot" ? (
        <SlotStep
          date={state.date}
          state={pickerState}
          recovery={state.recovery}
          nearestFree={nearestFree}
          holding={createHold.isPending}
          onPick={pickSlot}
          onDateChange={(date) => dispatch({ type: "choose-date", date })}
          onPickAnother={() => dispatch({ type: "dismiss-recovery" })}
        />
      ) : null}

      {state.step === "details" && state.hold && recap ? (
        <DetailsStep
          hold={state.hold}
          recap={recap}
          details={state.details}
          submitting={confirmBooking.isPending}
          onChange={(details) => dispatch({ type: "edit-details", details })}
          onSubmit={submitDetails}
          onExpire={() => loseHold("expired")}
        />
      ) : null}

      {state.step === "confirmed" && state.booking ? (
        <ConfirmedStep booking={state.booking} clinicName={clinic.data?.name ?? ""} />
      ) : null}
    </main>
  )
}
