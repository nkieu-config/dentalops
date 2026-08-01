import { LucideIcon } from "lucide-react"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  hint?: string
}

export const EmptyState = ({ icon: Icon, title, hint }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
    <Icon className="h-8 w-8 text-muted-foreground" />
    <p className="font-medium">{title}</p>
    {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
  </div>
)
