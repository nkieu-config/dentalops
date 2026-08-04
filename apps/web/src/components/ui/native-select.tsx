import { SelectHTMLAttributes, forwardRef } from "react"
import { cn } from "../../lib/cn"

export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:text-sm",
        className
      )}
      {...props}
    />
  )
)
NativeSelect.displayName = "NativeSelect"
