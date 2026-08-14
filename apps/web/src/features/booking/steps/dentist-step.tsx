import { Zap } from "lucide-react"
import { OptionCard } from "../option-card"

interface DentistOption {
  id: string
  name: string
}

interface DentistStepProps {
  dentists: DentistOption[]
  onChoose: (dentistId: string | null) => void
}

const initial = (name: string): string =>
  (name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").trim().charAt(0) || "?").toUpperCase()

export const DentistStep = ({ dentists, onChoose }: DentistStepProps) => (
  <div className="space-y-2">
    <h2 className="type-section-title font-semibold">Choose a dentist</h2>
    <ul className="space-y-2" aria-label="Dentists">
      <li>
        <OptionCard
          testId="any-dentist-option"
          title="First available dentist"
          detail="Shows the earliest available time"
          leading={<Zap className="h-5 w-5 shrink-0 text-primary" aria-hidden />}
          onClick={() => onChoose(null)}
        />
      </li>
      {dentists.map((dentist) => (
        <li key={dentist.id}>
          <OptionCard
            testId="dentist-option"
            dataDentist={dentist.id}
            title={dentist.name}
            leading={
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary type-card-title font-medium text-secondary-foreground"
              >
                {initial(dentist.name)}
              </span>
            }
            onClick={() => onChoose(dentist.id)}
          />
        </li>
      ))}
    </ul>
    <p className="type-supporting text-muted-foreground">
      Pick anyone, or let the clinic give you whichever dentist has the lightest day.
    </p>
  </div>
)
