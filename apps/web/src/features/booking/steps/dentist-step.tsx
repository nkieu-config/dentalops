import { ChevronRight, Zap } from "lucide-react"

interface DentistOption {
  id: string
  name: string
}

interface DentistStepProps {
  dentists: DentistOption[]
  onChoose: (dentistId: string | null) => void
}

const card =
  "flex min-h-16 w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 text-left transition-[background-color,border-color] duration-150 hover:border-input hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99]"

const initial = (name: string): string =>
  (name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").trim().charAt(0) || "?").toUpperCase()

export const DentistStep = ({ dentists, onChoose }: DentistStepProps) => (
  <div className="space-y-2">
    <h2 className="text-lg font-semibold">Choose a dentist</h2>
    <ul className="space-y-2" aria-label="Dentists">
      <li>
        <button
          type="button"
          data-testid="any-dentist-option"
          onClick={() => onChoose(null)}
          className={card}
        >
          <span className="flex items-center gap-3">
            <Zap className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="block text-base font-medium">Any available dentist</span>
              <span className="block text-base text-muted-foreground">Soonest booking</span>
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </li>
      {dentists.map((dentist) => (
        <li key={dentist.id}>
          <button
            type="button"
            data-testid="dentist-option"
            data-dentist={dentist.id}
            onClick={() => onChoose(dentist.id)}
            className={card}
          >
            <span className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-medium text-secondary-foreground"
              >
                {initial(dentist.name)}
              </span>
              <span className="block text-base font-medium">{dentist.name}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
    <p className="text-base text-muted-foreground">
      Pick anyone, or let the clinic give you whichever dentist has the lightest day.
    </p>
  </div>
)
