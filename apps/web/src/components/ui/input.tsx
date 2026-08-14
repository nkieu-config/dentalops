import { InputHTMLAttributes, forwardRef } from "react"
import { cn } from "../../lib/cn"
import { disabledControl, focusRing } from "./focus-ring"

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-control border border-input bg-background px-3 type-body shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground sm:h-10 [@media(pointer:coarse)]:h-11",
        focusRing,
        disabledControl,
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"
