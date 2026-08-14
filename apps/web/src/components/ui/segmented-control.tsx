import * as ToggleGroup from "@radix-ui/react-toggle-group"
import type { ReactNode } from "react"
import { cn } from "../../lib/cn"
import { focusRing } from "./focus-ring"

interface SegmentedControlProps {
  ariaLabel: string
  descriptionId?: string
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: ReactNode; ariaLabel?: string }[]
  className?: string
}

export const SegmentedControl = ({
  ariaLabel,
  descriptionId,
  value,
  onValueChange,
  options,
  className
}: SegmentedControlProps) => (
  <ToggleGroup.Root
    type="single"
    value={value}
    onValueChange={(next) => next && onValueChange(next)}
    aria-label={ariaLabel}
    aria-describedby={descriptionId}
    className={cn("inline-flex rounded-full bg-secondary p-1", className)}
  >
    {options.map((option) => (
      <ToggleGroup.Item
        key={option.value}
        value={option.value}
        aria-label={option.ariaLabel}
        className={cn(
          "min-h-11 touch-manipulation rounded-full px-3 py-1.5 type-ui font-semibold text-muted-foreground transition-[background-color,color,box-shadow,transform] duration-150 hover:bg-accent active:scale-[0.98] data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs data-[state=on]:hover:bg-card sm:min-h-10 [@media(pointer:coarse)]:min-h-11",
          focusRing
        )}
      >
        {option.label}
      </ToggleGroup.Item>
    ))}
  </ToggleGroup.Root>
)
