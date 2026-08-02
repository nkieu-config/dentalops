import type { PublicBooking } from "@dentalops/contracts"
import { CheckCircle2 } from "lucide-react"
import { BookingSummary } from "../booking-summary"

interface ConfirmedStepProps {
  booking: PublicBooking
  clinicName: string
}

export const ConfirmedStep = ({ booking, clinicName }: ConfirmedStepProps) => {
  const { appointment, manageToken } = booking

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
      <h2 className="text-2xl font-semibold">You are booked</h2>
      <p className="text-base text-muted-foreground">{clinicName}</p>
      <BookingSummary appointment={appointment} />
      <a
        href={`/manage/${manageToken}`}
        className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-base font-medium hover:bg-accent"
      >
        Change or cancel this booking
      </a>
      <p className="text-base text-muted-foreground">
        Keep this link — it is the only way to change the booking yourself.
      </p>
    </div>
  )
}
