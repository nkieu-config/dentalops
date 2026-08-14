import type { ComponentType, ReactNode, SVGProps } from "react"
import { cn } from "../../lib/cn"

type StatusTone = "neutral" | "success" | "warning" | "destructive"

interface StatusCalloutProps {
  tone?: StatusTone
  icon: ComponentType<SVGProps<SVGSVGElement>>
  title: string
  children?: ReactNode
  className?: string
}

const toneClass: Record<StatusTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  success: "bg-success-surface text-success-on-surface",
  warning: "bg-warning-surface text-warning-on-surface",
  destructive: "bg-destructive-surface text-destructive-on-surface"
}

export const StatusCallout = ({
  tone = "neutral",
  icon: Icon,
  title,
  children,
  className
}: StatusCalloutProps) => (
  <div
    role={tone === "destructive" ? "alert" : "status"}
    className={cn("flex gap-3 rounded-card p-3 type-ui", toneClass[tone], className)}
  >
    <Icon data-testid="status-callout-icon" aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
    <div className="min-w-0 space-y-0.5">
      <p className="font-semibold">{title}</p>
      {children ? <div className="leading-5">{children}</div> : null}
    </div>
  </div>
)
