import * as ToggleGroup from "@radix-ui/react-toggle-group"

interface SegmentedControlProps {
  ariaLabel: string
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
}

export const SegmentedControl = ({ ariaLabel, value, onValueChange, options }: SegmentedControlProps) => (
  <ToggleGroup.Root
    type="single"
    value={value}
    onValueChange={(next) => next && onValueChange(next)}
    aria-label={ariaLabel}
    className="inline-flex rounded-full bg-secondary p-1"
  >
    {options.map((option) => (
      <ToggleGroup.Item
        key={option.value}
        value={option.value}
        className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {option.label}
      </ToggleGroup.Item>
    ))}
  </ToggleGroup.Root>
)
