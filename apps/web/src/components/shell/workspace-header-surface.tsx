import type { HTMLAttributes } from "react"
import { cn } from "../../lib/cn"

export const WorkspaceHeaderSurface = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex min-w-0 items-center rounded-hero border border-border bg-card shadow-[var(--shadow-workspace-header)]",
      className
    )}
    {...props}
  >
    {children}
  </div>
)
