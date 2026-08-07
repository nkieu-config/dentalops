import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { Button } from "./button"

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  confirmDisabled?: boolean
  onConfirm: () => void
}

export const AlertDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  confirmDisabled = false,
  onConfirm
}: AlertDialogProps) => (
  <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay" />
      <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-card p-5 shadow-md focus:outline-none">
        <AlertDialogPrimitive.Title className="text-card-title font-bold">{title}</AlertDialogPrimitive.Title>
        <AlertDialogPrimitive.Description className="mt-2 text-supporting text-muted-foreground">{description}</AlertDialogPrimitive.Description>
        <div className="mt-5 flex justify-end gap-2">
          <AlertDialogPrimitive.Cancel asChild><Button variant="secondary">Keep appointment</Button></AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action asChild><Button variant="destructive" disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</Button></AlertDialogPrimitive.Action>
        </div>
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  </AlertDialogPrimitive.Root>
)
