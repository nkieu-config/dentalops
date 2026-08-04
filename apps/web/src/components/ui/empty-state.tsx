import { LucideIcon } from "lucide-react"
import { ReactNode } from "react"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
}

export const EmptyState = ({ icon: Icon, title, hint, action }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-decorative-surface">
      <Icon className="h-7 w-7 text-decorative-on-surface" aria-hidden="true" />
    </span>
    <div className="flex flex-col gap-1">
      <p className="font-semibold">{title}</p>
      {hint ? <p className="max-w-prose text-base text-muted-foreground">{hint}</p> : null}
    </div>
    {action}
  </div>
)
