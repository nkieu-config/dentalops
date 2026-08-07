import { bkkDate, fmtDay, fmtTime } from "../timeline/lib/geometry"

interface BookingRecapProps {
  startsAt: string
  serviceName: string
  dentistName: string
  branchName: string
}

const RecapRow = ({ label, value, numeric = false }: { label: string; value: string; numeric?: boolean }) => (
  <div className="flex justify-between gap-4 border-b border-border py-2 last:border-b-0 last:pb-0 first:pt-0">
    <dt className="text-base text-muted-foreground">{label}</dt>
    <dd className={`text-right text-base font-medium${numeric ? " tabular-nums" : ""}`}>{value}</dd>
  </div>
)

export const BookingRecap = ({ startsAt, serviceName, dentistName, branchName }: BookingRecapProps) => {
  const time = Date.parse(startsAt)

  return (
    <section aria-label="Appointment recap" className="rounded-panel border border-border bg-card px-4 py-3 shadow-panel">
      <h3 className="mb-3 text-base font-semibold">Appointment recap</h3>
      <dl>
        <RecapRow label="When" value={`${fmtDay(bkkDate(time))} · ${fmtTime(time)}`} numeric />
        <RecapRow label="Treatment" value={serviceName} />
        <RecapRow label="Dentist" value={dentistName} />
        <RecapRow label="Where" value={branchName} />
      </dl>
    </section>
  )
}
