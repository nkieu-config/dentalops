import type { Appointment } from "@dentalops/contracts"

interface UnseatedNoticeProps {
  appointments: Appointment[]
  onGroupByDentist?: () => void
}

export const UnseatedNotice = ({ appointments, onGroupByDentist }: UnseatedNoticeProps) => {
  if (appointments.length === 0) return null

  return (
    <section
      data-testid="unseated-notice"
      aria-label="Appointments without a chair"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/30 bg-warning-surface px-4 py-2 text-warning-on-surface md:px-6"
    >
      <p className="type-supporting">
        <span className="font-semibold">
          {appointments.length}{" "}
          {appointments.length === 1 ? "appointment has" : "appointments have"} no chair
        </span>{" "}
        — hidden from this view.
      </p>
      {onGroupByDentist ? (
        <button
          type="button"
          className="ml-auto min-h-11 shrink-0 rounded-control px-2 type-ui font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onGroupByDentist}
        >
          Group by dentist
        </button>
      ) : null}
    </section>
  )
}
