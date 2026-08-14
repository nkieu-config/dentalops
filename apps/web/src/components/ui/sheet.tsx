import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { ReactNode } from "react"
import { cn } from "../../lib/cn"
import { focusRing } from "./focus-ring"

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  side?: "right" | "bottom"
  mobileLayout?: "full" | "adaptive"
  children: ReactNode
  footer?: ReactNode
  initialFocusId?: string
}

export const Sheet = ({
  open,
  onOpenChange,
  title,
  side = "right",
  mobileLayout = "full",
  children,
  footer,
  initialFocusId
}: SheetProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
      <Dialog.Content
        onOpenAutoFocus={initialFocusId ? (event) => {
          event.preventDefault()
          document.getElementById(initialFocusId)?.focus()
        } : undefined}
        data-sheet-layout={mobileLayout}
        className={cn(
          "fixed z-50 grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-card text-card-foreground shadow-md focus:outline-none",
          side === "right" &&
            (mobileLayout === "adaptive"
              ? "inset-x-0 bottom-0 max-h-[calc(100dvh-4rem)] rounded-t-hero border-t border-border sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-l sm:border-t-0"
              : "inset-y-0 right-0 w-full max-w-md border-l border-border") +
              " data-[state=open]:animate-sheet-in-right data-[state=closed]:animate-sheet-out-right",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-hero border-t border-border data-[state=open]:animate-sheet-in-bottom data-[state=closed]:animate-sheet-out-bottom"
        )}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-4 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6 sm:pt-6">
          <Dialog.Title className="min-w-0 break-words type-dialog-title font-semibold">{title}</Dialog.Title>
          <Dialog.Close
            aria-label="Close"
            className={cn(
              "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-control hover:bg-accent sm:min-h-10 sm:min-w-10 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11",
              focusRing
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Dialog.Close>
        </div>
        <div data-testid="sheet-scroller" className="min-h-0 min-w-0 overscroll-contain overflow-x-hidden overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">{children}</div>
        {footer ? <footer data-testid="sheet-footer" className="min-w-0 border-t border-border bg-card px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-4">{footer}</footer> : null}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
)
