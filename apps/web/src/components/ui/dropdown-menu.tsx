import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu"

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuContent = ({ className, ...props }: DropdownMenuPrimitive.DropdownMenuContentProps) => (
  <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content className={`z-50 min-w-40 rounded-card border border-border bg-popover p-1 text-popover-foreground shadow-md ${className ?? ""}`} sideOffset={8} {...props} /></DropdownMenuPrimitive.Portal>
)
export const DropdownMenuItem = ({ className, ...props }: DropdownMenuPrimitive.DropdownMenuItemProps) => <DropdownMenuPrimitive.Item className={`flex cursor-pointer items-center rounded-control px-3 py-2 text-sm font-semibold outline-none focus:bg-accent ${className ?? ""}`} {...props} />
