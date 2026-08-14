import * as SelectPrimitive from "@radix-ui/react-select"
import { type VariantProps } from "class-variance-authority"
import { Check, ChevronDown } from "lucide-react"
import { type ButtonHTMLAttributes } from "react"
import { cn } from "../../lib/cn"
import {
  selectChevronClass,
  selectIndicatorWellClass,
  selectTriggerVariants
} from "./select-trigger-styles"

export interface AppSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface AppSelectProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange">,
    VariantProps<typeof selectTriggerVariants> {
  value: string
  onValueChange: (value: string) => void
  options: AppSelectOption[]
  placeholder?: string
  prefix?: string
}

export const AppSelect = ({
  className,
  value,
  onValueChange,
  options,
  placeholder,
  prefix,
  disabled,
  name,
  variant,
  ...triggerProps
}: AppSelectProps) => (
  <SelectPrimitive.Root name={name} value={value} onValueChange={onValueChange} disabled={disabled}>
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      name={name}
      className={cn(
        selectTriggerVariants({ variant }),
        className
      )}
      {...triggerProps}
    >
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
        {prefix ? (
          <>
            <span
              data-testid="app-select-prefix"
              className="shrink-0 type-meta font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {prefix}
            </span>
            <span aria-hidden="true" className="shrink-0 text-border-strong">
              ·
            </span>
          </>
        ) : null}
        <SelectPrimitive.Value className="min-w-0 truncate" placeholder={placeholder} />
      </span>
      <SelectPrimitive.Icon asChild>
        <span data-testid="select-indicator-well" className={selectIndicatorWellClass}>
          <ChevronDown
            data-testid="select-chevron"
            className={selectChevronClass}
            aria-hidden="true"
          />
        </span>
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={6}
        collisionPadding={16}
        className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)] origin-[var(--radix-select-content-transform-origin)] overflow-hidden rounded-card border border-border bg-popover p-1.5 text-popover-foreground shadow-[0_16px_36px_rgb(20_48_44/0.18)]"
      >
        <SelectPrimitive.Viewport className="max-h-72 overflow-y-auto overscroll-contain">
          {options.map((option) => (
            <SelectPrimitive.Item
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className="relative flex min-h-11 cursor-pointer select-none items-center rounded-control py-2 pl-9 pr-3 type-ui font-medium outline-none transition-colors duration-100 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[state=checked]:bg-secondary data-[state=checked]:text-secondary-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 sm:min-h-10"
            >
              <SelectPrimitive.ItemIndicator className="absolute left-2.5 inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3.5" aria-hidden="true" />
              </SelectPrimitive.ItemIndicator>
              <SelectPrimitive.ItemText className="min-w-0 truncate">{option.label}</SelectPrimitive.ItemText>
            </SelectPrimitive.Item>
          ))}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>
)
