import * as PopoverPrimitive from "@radix-ui/react-popover"
import { cn } from "../../lib/cn"

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverContent = ({ className, ...props }: PopoverPrimitive.PopoverContentProps) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      collisionPadding={16}
      sideOffset={8}
      className={cn(
        "z-50 max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] overflow-auto rounded-card border border-border bg-popover p-3 text-popover-foreground shadow-md",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
)
