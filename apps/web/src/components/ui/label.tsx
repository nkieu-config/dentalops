import { LabelHTMLAttributes } from "react"
import { cn } from "../../lib/cn"

export const Label = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn("type-ui font-medium text-foreground", className)}
    {...props}
  />
)
