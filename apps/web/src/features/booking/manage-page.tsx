import { Ban, CalendarX } from "lucide-react"
import { useState } from "react"
import { useParams } from "react-router"
import { Button } from "../../components/ui/button"
import { EmptyState } from "../../components/ui/empty-state"
import { Sheet } from "../../components/ui/sheet"
import { Skeleton } from "../../components/ui/skeleton"
import { bkkDate, fmtDay, fmtTime } from "../timeline/lib/geometry"
import { BookingSummary } from "./booking-summary"
import { useCancelBooking, useManagedBooking } from "./hooks"

export const ManagePage = () => {
  const { token = "" } = useParams()
  const booking = useManagedBooking(token)
  const cancel = useCancelBooking(token)
  const [confirming, setConfirming] = useState(false)

  const appointment = booking.data
  const cancelled = appointment?.status === "cancelled"

  const confirmCancel = () =>
    cancel.mutate(undefined, {
      onSettled: () => setConfirming(false)
    })

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
                Need a different time? Call the clinic — they can move it for you.
              </p>
              <div className="sticky bottom-0 mt-auto bg-background pt-3">
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
            open={confirming}
            onOpenChange={setConfirming}
            title="Cancel this booking?"
            side="bottom"
          >
            <div className="space-y-4 text-base" data-testid="cancel-confirm">
              <p className="text-base">
                <span className="tabular-nums">
                  {fmtDay(bkkDate(Date.parse(appointment.startsAt)))} ·{" "}
                  {fmtTime(Date.parse(appointment.startsAt))}
                </span>{" "}
                will be given to someone else. This cannot be undone.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="destructive"
                  className="min-h-12 w-full text-base"
                  disabled={cancel.isPending}
                  onClick={confirmCancel}
                >
                  {cancel.isPending ? "Cancelling…" : "Yes, cancel booking"}
                </Button>
                <Button
                  variant="secondary"
                  className="min-h-12 w-full text-base"
                  onClick={() => setConfirming(false)}
                >
                  Keep my booking
                </Button>
              </div>
            </div>
          </Sheet>
        </>
      ) : null}
    </main>
  )
}
