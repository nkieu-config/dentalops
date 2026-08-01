import { LabelHTMLAttributes } from "react"
import { cn } from "../../lib/cn"

export const Label = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn("text-xs font-medium uppercase tracking-wide text-muted-foreground", className)}
    {...props}
  />
)
