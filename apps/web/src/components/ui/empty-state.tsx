import { LucideIcon } from "lucide-react"
import { ReactNode } from "react"
import { cn } from "../../lib/cn"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}

export const EmptyState = ({ icon: Icon, title, hint, action, className }: EmptyStateProps) => (
  <div className={cn("flex flex-col items-center justify-center gap-3 py-12 text-center", className)}>
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-decorative-surface">
      <Icon className="h-7 w-7 text-decorative-on-surface" aria-hidden="true" />
    </span>
    <div className="flex flex-col gap-1">
      <p className="type-card-title font-semibold">{title}</p>
      {hint ? <p className="max-w-prose type-supporting text-muted-foreground">{hint}</p> : null}
    </div>
    {action}
  </div>
)
