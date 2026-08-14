import { ChevronRight } from "lucide-react"
import type { ReactNode } from "react"

interface OptionCardProps {
  onClick: () => void
  leading?: ReactNode
  title: string
  detail?: string
  testId: string
  dataDentist?: string
}

export const OptionCard = ({ onClick, leading, title, detail, testId, dataDentist }: OptionCardProps) => (
  <button
    type="button"
    data-testid={testId}
    data-dentist={dataDentist}
    onClick={onClick}
    className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-3 rounded-card border border-border bg-card px-4 py-3 text-left transition-[background-color,border-color] duration-150 hover:border-input hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.99]"
  >
    <span className="flex min-w-0 items-center gap-3">
      {leading}
      <span className="min-w-0">
        <span className="block type-card-title font-medium">{title}</span>
        {detail ? <span className="block type-supporting text-muted-foreground">{detail}</span> : null}
      </span>
    </span>
    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
  </button>
)
