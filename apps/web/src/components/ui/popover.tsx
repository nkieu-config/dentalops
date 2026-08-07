import * as PopoverPrimitive from "@radix-ui/react-popover"

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverContent = ({ className, ...props }: PopoverPrimitive.PopoverContentProps) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content className={`z-50 rounded-card border border-border bg-popover p-3 text-popover-foreground shadow-md ${className ?? ""}`} sideOffset={8} {...props} />
  </PopoverPrimitive.Portal>
)
