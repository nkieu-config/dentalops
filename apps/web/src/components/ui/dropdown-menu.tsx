import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"
import { cn } from "../../lib/cn"
import { focusRing } from "./focus-ring"

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuLabel = DropdownMenuPrimitive.Label
export const DropdownMenuSeparator = DropdownMenuPrimitive.Separator

export const DropdownMenuContent = ({
  className,
  ...props
}: DropdownMenuPrimitive.DropdownMenuContentProps) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      collisionPadding={16}
      sideOffset={8}
      className={cn(
        "z-50 max-h-[calc(100dvh-2rem)] min-w-40 max-w-[calc(100vw-2rem)] overflow-auto rounded-card border border-border bg-popover p-1 text-popover-foreground shadow-md",
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
)

export const DropdownMenuItem = ({
  className,
  ...props
}: DropdownMenuPrimitive.DropdownMenuItemProps) => (
  <DropdownMenuPrimitive.Item
    className={cn(
      "flex min-h-11 cursor-pointer items-center rounded-control px-3 py-2 type-ui font-semibold outline-none focus:bg-accent sm:min-h-10",
      focusRing,
      className
    )}
    {...props}
  />
)
