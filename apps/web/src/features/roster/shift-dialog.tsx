import type { StaffMember, Violation } from "@dentalops/contracts"
import { TriangleAlert } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { OFFLINE_MESSAGE } from "../../components/shell/offline-banner"
import { Button } from "../../components/ui/button"
import { AlertDialog } from "../../components/ui/alert-dialog"
import { Field, FieldInput, FormError } from "../../components/ui/form-field"
import { AppSelect } from "../../components/ui/app-select"
import { Sheet } from "../../components/ui/sheet"
import { StatusCallout } from "../../components/ui/status-callout"
import { useDiscardGuard } from "../../lib/use-discard-guard"
import { shiftFormInterval, type ShiftForm } from "./hooks"
import { ViolationList, type ViolationLink } from "./violation-list"

const OFFLINE_REASON_ID = "shift-dialog-offline-reason"

interface ShiftDialogProps {
  value: ShiftForm | null
  staff: StaffMember[]
  violations: Violation[]
  blocked: boolean
  error: boolean
  settling: boolean
  saving: boolean
  offline: boolean
  staffName: (staffId: string) => string
  linkFor: (violation: Violation) => ViolationLink | null
  onChange: (next: ShiftForm) => void
  onSave: () => void
  onDelete: () => Promise<void>
  onClose: () => void
}

export const ShiftDialog = ({
  value,
  staff,
  violations,
  blocked,
  error,
  settling,
  saving,
  offline,
  staffName,
  linkFor,
  onChange,
  onSave,
  onDelete,
  onClose
}: ShiftDialogProps) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const initialValue = useRef<ShiftForm | null>(null)
  const invalidInterval =
    value !== null && value.start !== "" && value.end !== "" && shiftFormInterval(value) === null

  useEffect(() => {
    if (value === null) {
      initialValue.current = null
      setConfirmingDelete(false)
      return
    }
    if (initialValue.current === null) initialValue.current = value
  }, [value])

  const close = () => {
    setConfirmingDelete(false)
    onClose()
  }
  const dirty = value !== null && JSON.stringify(value) !== JSON.stringify(initialValue.current)
  const discardGuard = useDiscardGuard(dirty, close)

  return (
    <>
    <Sheet
      open={value !== null}
      onOpenChange={discardGuard.requestClose}
      title={value?.shiftId ? "Edit shift" : "New shift"}
      footer={
        value ? (
          <div data-testid="shift-dialog-footer" className="flex flex-wrap items-center gap-2">
            {value.shiftId ? (
  <Button
    variant="destructive"
                    onClick={() => setConfirmingDelete(true)}
    disabled={saving || offline}
    title={offline ? OFFLINE_MESSAGE : undefined}
    aria-describedby={offline ? OFFLINE_REASON_ID : undefined}
  >
    Delete shift
  </Button>
            ) : null}
            <div className="flex-1" />
            <Button variant="secondary" onClick={() => discardGuard.requestClose(false)}>
  Cancel
            </Button>
            <Button
                onClick={onSave}
  disabled={blocked || settling || saving || offline || shiftFormInterval(value) === null}
  title={offline ? OFFLINE_MESSAGE : undefined}
  aria-describedby={offline ? OFFLINE_REASON_ID : undefined}
            >
  Save shift
            </Button>
          </div>
        ) : null
      }
    >
      {value ? (
        <div className="space-y-4">
          <Field id="shift-staff" label="Dentist">
            {(aria) => (
  <AppSelect
    {...aria}
    value={value.staffId}
    disabled={value.shiftId !== undefined}
    aria-label="Dentist"
    placeholder="Choose a dentist"
    onValueChange={(staffId) => onChange({ ...value, staffId })}
    options={staff.map((member) => ({ value: member.id, label: member.name }))}
  />
            )}
          </Field>
          <Field id="shift-date" label="Date">
            {(aria) => (
  <FieldInput
    {...aria}
    type="date"
    className="tabular-nums"
    value={value.date}
    onChange={(e) => onChange({ ...value, date: e.target.value })}
  />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="shift-start" label="Starts">
  {(aria) => (
    <FieldInput
      {...aria}
      type="time"
      className="tabular-nums"
      value={value.start}
      onChange={(e) => onChange({ ...value, start: e.target.value })}
    />
  )}
            </Field>
            <Field id="shift-end" label="Ends">
  {(aria) => (
    <FieldInput
      {...aria}
      type="time"
      className="tabular-nums"
      value={value.end}
      onChange={(e) => onChange({ ...value, end: e.target.value })}
    />
  )}
            </Field>
          </div>
          <FormError message={invalidInterval ? "End time must be later than start time." : null} />
          <section aria-label="Draft validation" className="rounded-md border border-border p-3">
            {error ? (
  <StatusCallout tone="warning" icon={TriangleAlert} title="Could not check this draft">
    Scheduling conflicts could not be checked, so saving is paused until this succeeds
    again.
  </StatusCallout>
            ) : (
  <ViolationList violations={violations} staffName={staffName} linkFor={linkFor} />
            )}
          </section>
          {offline ? (
            <p id={OFFLINE_REASON_ID} className="type-meta font-medium text-destructive">
  {OFFLINE_MESSAGE}
            </p>
          ) : null}
        </div>
      ) : null}
      <AlertDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete shift?"
        description="This permanently removes the shift from the roster."
        confirmLabel="Delete permanently"
        cancelLabel="Keep shift"
        onConfirm={onDelete}
      />
    </Sheet>
    {discardGuard.dialog}
    </>
  )
}
