import type { PublicAppointment } from "@dentalops/contracts"
import { bkkDate, fmtDay, fmtTime } from "../timeline/lib/geometry"

interface BookingSummaryProps {
  appointment: PublicAppointment
}

interface RowProps {
  label: string
  value: string
  numeric?: boolean
}

const Row = ({ label, value, numeric = false }: RowProps) => (
  <div className="flex justify-between gap-4">
    <dt className="text-base text-muted-foreground">{label}</dt>
    <dd className={`text-base font-medium${numeric ? " tabular-nums" : ""}`}>{value}</dd>
  </div>
)

export const BookingSummary = ({ appointment }: BookingSummaryProps) => {
  const startsAt = Date.parse(appointment.startsAt)

  return (
    <dl className="w-full space-y-2 rounded-md border border-border p-4 text-left">
      <Row label="When" value={`${fmtDay(bkkDate(startsAt))} · ${fmtTime(startsAt)}`} numeric />
      <Row label="Treatment" value={appointment.service.name} />
      <Row label="Dentist" value={appointment.dentist.name} />
      <Row label="Where" value={appointment.branch.name} />
      <Row label="Name" value={appointment.patient.name} />
    </dl>
  )
}
