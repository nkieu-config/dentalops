import type { PublicBooking } from "@dentalops/contracts"
import { CheckCircle2 } from "lucide-react"
import { bkkDate, fmtDay, fmtTime } from "../../timeline/lib/geometry"

interface ConfirmedStepProps {
  booking: PublicBooking
  clinicName: string
}

export const ConfirmedStep = ({ booking, clinicName }: ConfirmedStepProps) => {
  const { appointment, manageToken } = booking
  const startsAt = Date.parse(appointment.startsAt)

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
      <h2 className="text-2xl font-semibold">You are booked</h2>
      <p className="text-base text-muted-foreground">{clinicName}</p>
      <dl className="w-full space-y-2 rounded-md border border-border p-4 text-left">
        <div className="flex justify-between gap-4">
          <dt className="text-base text-muted-foreground">When</dt>
          <dd className="text-base font-medium tabular-nums">
            {fmtDay(bkkDate(startsAt))} · {fmtTime(startsAt)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-base text-muted-foreground">Treatment</dt>
          <dd className="text-base font-medium">{appointment.service.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-base text-muted-foreground">Dentist</dt>
          <dd className="text-base font-medium">{appointment.dentist.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-base text-muted-foreground">Where</dt>
          <dd className="text-base font-medium">{appointment.branch.name}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-base text-muted-foreground">Name</dt>
          <dd className="text-base font-medium">{appointment.patient.name}</dd>
        </div>
      </dl>
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
