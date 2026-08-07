import type { WizardStep } from "./wizard-reducer"

const BOOKING_STEPS: ReadonlyArray<{ id: WizardStep; label: string }> = [
  { id: "service", label: "Choose service" },
  { id: "dentist", label: "Choose dentist" },
  { id: "slot", label: "Choose time" },
  { id: "details", label: "Your details" }
]

export const BookingStepper = ({ current }: { current: WizardStep }) => {
  const currentIndex = BOOKING_STEPS.findIndex((step) => step.id === current)

  return (
    <nav aria-label="Booking progress">
      <div className="flex flex-wrap gap-2">
        {BOOKING_STEPS.map((step, index) => {
          const isCurrent = step.id === current
          const isComplete = index < currentIndex

          return (
            <div key={step.id}>
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-base font-semibold ${
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isComplete
                      ? "bg-primary/10 text-foreground"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                <span>{index + 1}</span>
                <span>{step.label}</span>
              </span>
            </div>
          )
        })}
      </div>
    </nav>
  )
}
