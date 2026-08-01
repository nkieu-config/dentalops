import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { ReactNode } from "react"
import { cn } from "../../lib/cn"

interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  side?: "right" | "bottom"
  children: ReactNode
}

export const Sheet = ({ open, onOpenChange, title, side = "right", children }: SheetProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
      <Dialog.Content
        className={cn(
          "fixed z-50 bg-card text-card-foreground shadow-md focus:outline-none overflow-y-auto",
          side === "right" &&
            "inset-y-0 right-0 w-full max-w-md border-l border-border p-6",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-lg border-t border-border p-6"
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
          <Dialog.Close
            aria-label="Close"
            className="rounded-md p-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>
        </div>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
)
