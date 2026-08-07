import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import type { ReactNode } from "react"

export const TooltipProvider = TooltipPrimitive.Provider

export const Tooltip = ({ content, children }: { content: string; children: ReactNode }) => (
  <TooltipPrimitive.Root>
    <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content sideOffset={6} className="z-50 rounded-control bg-foreground px-2 py-1 text-meta font-semibold text-background">
        {content}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
)
