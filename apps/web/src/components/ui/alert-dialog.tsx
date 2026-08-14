import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { useState } from "react"
import { toast } from "sonner"
import { ApiError } from "../../lib/api"
import { Button } from "./button"

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  confirmVariant?: "default" | "secondary" | "destructive"
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
}

export const AlertDialog = ({ open, onOpenChange, title, description, confirmLabel, confirmVariant = "destructive", cancelLabel, onConfirm }: AlertDialogProps) => {
  const [pending, setPending] = useState(false)

  const handleConfirm = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't go through. Try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-border bg-card p-5 shadow-md focus:outline-none overscroll-contain">
          <AlertDialogPrimitive.Title className="type-dialog-title font-semibold">{title}</AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description className="mt-2 break-words type-supporting text-muted-foreground">{description}</AlertDialogPrimitive.Description>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary" disabled={pending}>{cancelLabel ?? "Cancel"}</Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild onClick={handleConfirm}>
              <Button variant={confirmVariant} disabled={pending}>{pending ? "Working…" : confirmLabel}</Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  )
}
