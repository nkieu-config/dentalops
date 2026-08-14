import { InputHTMLAttributes, forwardRef } from "react"
import { cn } from "../../lib/cn"
import { disabledControl, focusRing } from "./focus-ring"

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn("size-5 shrink-0 cursor-pointer accent-primary", focusRing, disabledControl, className)}
      {...props}
    />
  )
)
Checkbox.displayName = "Checkbox"
