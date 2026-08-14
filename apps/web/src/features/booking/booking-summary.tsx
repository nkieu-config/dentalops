import type { PublicAppointment } from "@dentalops/contracts"
import { Card } from "../../components/ui/card"
import { bkkDate, fmtDay, fmtTime } from "../timeline/lib/geometry"

interface BookingSummaryProps {
  appointment: PublicAppointment
}

interface RowProps {
  label: string
  value: string
  numeric?: boolean
}

export const Row = ({ label, value, numeric = false }: RowProps) => (
  <div className="flex justify-between gap-4 border-b border-border py-2.5 last:border-b-0 last:pb-0 first:pt-0">
    <dt className="shrink-0 type-supporting text-muted-foreground">{label}</dt>
    <dd className={`min-w-0 break-words text-right type-card-title font-medium${numeric ? " tabular-nums" : ""}`}>{value}</dd>
  </div>
)

export const BookingSummary = ({ appointment }: BookingSummaryProps) => {
  const startsAt = Date.parse(appointment.startsAt)

  return (
    <Card className="w-full px-4 py-3 text-left">
      <dl>
        <Row label="When" value={`${fmtDay(bkkDate(startsAt))} · ${fmtTime(startsAt)}`} numeric />
        <Row label="Treatment" value={appointment.service.name} />
        <Row label="Dentist" value={appointment.dentist.name} />
        <Row label="Where" value={appointment.branch.name} />
        <Row label="Name" value={appointment.patient.name} />
      </dl>
    </Card>
  )
}
