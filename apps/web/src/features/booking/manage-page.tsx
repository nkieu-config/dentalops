import { useQueryClient } from "@tanstack/react-query"
import { Ban, CalendarX } from "lucide-react"
import { useMemo, useState } from "react"
import { useParams } from "react-router"
import { toast } from "sonner"
import { SlotPickerView, type SlotPickerState } from "../../components/slot-picker"
import { Button } from "../../components/ui/button"
import { EmptyState } from "../../components/ui/empty-state"
import { Sheet } from "../../components/ui/sheet"
import { Skeleton } from "../../components/ui/skeleton"
import { ApiError } from "../../lib/api"
import { bkkDate, fmtDay, fmtTime } from "../timeline/lib/geometry"
import { BookingSummary } from "./booking-summary"
import { CountdownBanner } from "./countdown-banner"
import {
  AVAILABILITY_KEY,
  useCancelBooking,
  useCreateHold,
  useManagedBooking,
  usePublicAvailability,
  useReleaseHold,
  useRescheduleBooking
} from "./hooks"

interface HeldSlot {
  holdId: string
  expiresAt: string
  startsAt: string
}

export const ManagePage = () => {
  const { token = "" } = useParams()
  const queryClient = useQueryClient()
  const booking = useManagedBooking(token)
  const cancel = useCancelBooking(token)
  const [confirming, setConfirming] = useState(false)
  const [moving, setMoving] = useState(false)
  const [date, setDate] = useState("")
  const [held, setHeld] = useState<HeldSlot | null>(null)

  const appointment = booking.data
  const cancelled = appointment?.status === "cancelled"
  const clinicSlug = appointment?.clinic.slug ?? ""

  const createHold = useCreateHold(clinicSlug)
  const releaseHold = useReleaseHold(clinicSlug)
  const reschedule = useRescheduleBooking(token)

  const availability = usePublicAvailability({
    clinicSlug,
    serviceId: appointment?.service.id ?? null,
    branchId: appointment?.branch.id ?? null,
    dentistId: appointment?.dentist.id ?? null,
    date,
    enabled: moving && date !== ""
  })

  const pickerState = useMemo<SlotPickerState>(() => {
    if (availability.isPending) return { status: "loading" }
    if (availability.isError) return { status: "error" }
    return { status: "ready", slots: availability.data?.slots ?? [] }
  }, [availability.isPending, availability.isError, availability.data])

  const refreshSlots = () => {
    void queryClient.invalidateQueries({ queryKey: [AVAILABILITY_KEY] })
  }

  const dropHold = (reason: string) => {
    setHeld(null)
    refreshSlots()
    toast.error(reason)
  }

  const confirmCancel = () =>
    cancel.mutate(undefined, {
      onSettled: () => setConfirming(false)
    })

  const openMove = () => {
    if (!appointment) return
    setDate(bkkDate(Date.parse(appointment.startsAt)))
    setMoving(true)
  }

  const releaseHeld = () => {
    if (held) releaseHold.mutate(held.holdId, { onSettled: refreshSlots })
    setHeld(null)
  }

  const closeMove = () => {
    releaseHeld()
    setMoving(false)
  }

  const pickSlot = (startsAt: string) => {
    if (!appointment || createHold.isPending) return
    createHold.mutate(
      {
        serviceId: appointment.service.id,
        branchId: appointment.branch.id,
        dentistId: appointment.dentist.id,
        startsAt
      },
      {
        onSuccess: (hold) => setHeld({ ...hold, startsAt }),
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

  const confirmMove = () => {
    if (!held) return
    reschedule.mutate(held.holdId, {
      onSuccess: () => {
        setHeld(null)
        setMoving(false)
        toast.success("Your booking has moved")
      },
      onError: (error) => {
        if (error instanceof ApiError && error.errorCode === "HOLD_EXPIRED") {
          dropHold("That hold expired — pick another time")
          return
        }
        if (error instanceof ApiError && error.errorCode === "SLOT_CONFLICT") {
          dropHold("That time was just booked — pick another")
          return
        }
        toast.error(error instanceof ApiError ? error.message : "Could not move your booking")
      }
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4 text-base">
      <h1 className="text-lg font-semibold">Your booking</h1>

      {booking.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : null}

      {booking.isError ? (
        <EmptyState
          icon={CalendarX}
          title="We could not open that booking"
          hint="The link may have expired. Call the clinic and they can help."
        />
      ) : null}

      {appointment ? (
        <>
          {cancelled ? (
            <p
              role="status"
              data-testid="cancelled-notice"
              className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-base text-muted-foreground"
            >
              <Ban className="h-5 w-5 shrink-0" aria-hidden />
              This booking is cancelled
            </p>
          ) : null}

          <BookingSummary appointment={appointment} />

          {cancelled ? (
            <p className="text-base text-muted-foreground">
              Call the clinic if you would like to book another time.
            </p>
          ) : (
            <>
              <p className="text-base text-muted-foreground">
                Need a different time? Pick one below — we hold it for five minutes while you
                confirm.
              </p>
              <div className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-background pt-3">
                <Button className="min-h-12 w-full text-base" onClick={openMove}>
                  Move to another time
                </Button>
                <Button
                  variant="destructive"
                  className="min-h-12 w-full text-base"
                  onClick={() => setConfirming(true)}
                >
                  Cancel this booking
                </Button>
              </div>
            </>
          )}

          <Sheet
            open={moving}
            onOpenChange={(open) => (open ? setMoving(true) : closeMove())}
            title="Move your booking"
            side="bottom"
          >
            <div className="space-y-4 text-base" data-testid="reschedule-panel">
              {held ? (
                <>
                  <CountdownBanner
                    expiresAt={held.expiresAt}
                    startsAt={held.startsAt}
                    onExpire={() => dropHold("That hold expired — pick another time")}
                  />
                  <p className="text-base" data-testid="reschedule-comparison">
                    <span className="tabular-nums text-muted-foreground line-through decoration-1">
                      {fmtDay(bkkDate(Date.parse(appointment.startsAt)))} ·{" "}
                      {fmtTime(Date.parse(appointment.startsAt))}
                    </span>
                    {" → "}
                    <span className="tabular-nums font-semibold text-foreground">
                      {fmtDay(bkkDate(Date.parse(held.startsAt)))} ·{" "}
                      {fmtTime(Date.parse(held.startsAt))}
                    </span>
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button
                      className="min-h-12 w-full text-base"
                      disabled={reschedule.isPending}
                      onClick={confirmMove}
                    >
                      {reschedule.isPending ? "Moving…" : "Confirm new time"}
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-12 w-full text-base"
                      onClick={releaseHeld}
                    >
                      Pick another time
                    </Button>
                  </div>
                </>
              ) : (
                <div aria-busy={createHold.isPending}>
                  <SlotPickerView
                    date={date}
                    state={pickerState}
                    onPick={pickSlot}
                    onDateChange={setDate}
                  />
                  {createHold.isPending ? (
                    <p role="status" className="pt-3 text-base text-muted-foreground">
                      Holding that time for you…
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </Sheet>

          <Sheet
            open={confirming}
            onOpenChange={setConfirming}
            title="Cancel this booking?"
            side="bottom"
          >
            <div className="space-y-4 text-base" data-testid="cancel-confirm">
              <p className="text-base leading-relaxed text-muted-foreground">
                <span className="tabular-nums font-semibold text-foreground">
                  {fmtDay(bkkDate(Date.parse(appointment.startsAt)))} ·{" "}
                  {fmtTime(Date.parse(appointment.startsAt))}
                </span>{" "}
                will be given to someone else. Booking history is retained.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="min-h-12 w-full text-base font-semibold"
                  onClick={() => setConfirming(false)}
                >
                  Keep my booking
                </Button>
                <Button
                  variant="destructive"
                  className="min-h-12 w-full text-base font-semibold"
                  disabled={cancel.isPending}
                  onClick={confirmCancel}
                >
                  {cancel.isPending ? "Cancelling…" : "Yes, cancel booking"}
                </Button>
              </div>
            </div>
          </Sheet>
        </>
      ) : null}
    </main>
  )
}
