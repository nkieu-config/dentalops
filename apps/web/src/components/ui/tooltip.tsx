import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import type { ReactNode } from "react"

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={300}>
    {children}
  </TooltipPrimitive.Provider>
)

export const Tooltip = ({ content, children }: { content: string; children: ReactNode }) => (
  <TooltipPrimitive.Root>
    <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        collisionPadding={12}
        sideOffset={6}
        className="z-50 max-w-56 break-words rounded-control bg-foreground px-2 py-1 type-meta font-semibold text-background"
      >
        {content}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
)
