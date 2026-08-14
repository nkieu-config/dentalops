import { useEffect, useState } from "react"
import { AlertDialog } from "../components/ui/alert-dialog"

export const useDiscardGuard = (dirty: boolean, onClose: () => void) => {
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    if (!dirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warnBeforeUnload)
    return () => window.removeEventListener("beforeunload", warnBeforeUnload)
  }, [dirty])
  const requestClose = (open: boolean) => {
    if (open) return
    if (dirty) {
      setConfirming(true)
      return
    }
    onClose()
  }
  const dialog = (
    <AlertDialog
      open={confirming}
      onOpenChange={(open) => { if (!open) setConfirming(false) }}
      title="Discard changes?"
      description="You have unsaved changes. Are you sure you want to discard them?"
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onConfirm={() => { setConfirming(false); onClose() }}
    />
  )
  return { requestClose, dialog }
}
