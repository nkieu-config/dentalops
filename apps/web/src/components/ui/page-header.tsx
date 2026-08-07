import type { ReactNode } from "react"
import { cn } from "../../lib/cn"

interface PageHeaderProps {
  title: string
  description?: string
  children?: ReactNode
  className?: string
}

export const PageHeader = ({ title, description, children, className }: PageHeaderProps) => (
  <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
    <div className="min-w-0 space-y-1">
      <h1 className="text-page-title font-bold tracking-[-0.02em]">{title}</h1>
      {description ? <p className="text-supporting text-muted-foreground">{description}</p> : null}
    </div>
    {children ? <div className="flex shrink-0 items-center gap-2">{children}</div> : null}
  </header>
)
