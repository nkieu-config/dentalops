import { ChevronRight, Zap } from "lucide-react"

interface DentistStepProps {
  onChoose: (dentistId: string | null) => void
}

export const DentistStep = ({ onChoose }: DentistStepProps) => (
  <div className="space-y-2">
    <h2 className="text-lg font-semibold">Choose a dentist</h2>
    <ul className="space-y-2">
      <li>
        <button
          type="button"
          data-testid="any-dentist-option"
          onClick={() => onChoose(null)}
          className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-3 rounded-md border border-border px-4 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    </ul>
    <p className="text-base text-muted-foreground">
      This clinic books you with the first dentist free at the time you choose.
    </p>
  </div>
)
