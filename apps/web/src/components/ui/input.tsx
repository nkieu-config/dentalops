import { InputHTMLAttributes, forwardRef } from "react"
import { cn } from "../../lib/cn"

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:h-9 sm:text-sm",
        className
      )}
      {...props}
    />
  )
)
Input.displayName = "Input"
