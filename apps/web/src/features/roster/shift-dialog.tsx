import type { StaffMember, Violation } from "@dentalops/contracts"
import { OFFLINE_MESSAGE } from "../../components/shell/offline-banner"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { NativeSelect } from "../../components/ui/native-select"
import { Sheet } from "../../components/ui/sheet"
import { shiftFormInterval, type ShiftForm } from "./hooks"
import { ViolationList, type ViolationLink } from "./violation-list"

const OFFLINE_REASON_ID = "shift-dialog-offline-reason"

interface ShiftDialogProps {
  value: ShiftForm | null
  staff: StaffMember[]
  violations: Violation[]
  blocked: boolean
  settling: boolean
  saving: boolean
  offline: boolean
  staffName: (staffId: string) => string
  linkFor: (violation: Violation) => ViolationLink | null
  onChange: (next: ShiftForm) => void
  onSave: () => void
  onDelete: () => void
  onClose: () => void
}

export const ShiftDialog = ({
  value,
  staff,
  violations,
  blocked,
  settling,
  saving,
  offline,
  staffName,
  linkFor,
  onChange,
  onSave,
  onDelete,
  onClose
}: ShiftDialogProps) => (
  <Sheet
    open={value !== null}
    onOpenChange={(open) => {
      if (!open) onClose()
    }}
    title={value?.shiftId ? "Edit shift" : "New shift"}
  >
    {value ? (
      <div className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="shift-staff">Staff</Label>
          <NativeSelect
            id="shift-staff"
            value={value.staffId}
            disabled={value.shiftId !== undefined}
            onChange={(e) => onChange({ ...value, staffId: e.target.value })}
          >
            <option value="">Choose a staff member</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="shift-date">Date</Label>
          <Input
            id="shift-date"
            type="date"
            className="min-h-11 tabular-nums"
            value={value.date}
            onChange={(e) => onChange({ ...value, date: e.target.value })}
          />
        </div>
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="shift-start">Starts</Label>
            <Input
              id="shift-start"
              type="time"
              className="min-h-11 tabular-nums"
              value={value.start}
              onChange={(e) => onChange({ ...value, start: e.target.value })}
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="shift-end">Ends</Label>
            <Input
              id="shift-end"
              type="time"
              className="min-h-11 tabular-nums"
              value={value.end}
              onChange={(e) => onChange({ ...value, end: e.target.value })}
            />
          </div>
        </div>
        <section aria-label="Draft validation" className="rounded-md border border-border p-3">
          <ViolationList violations={violations} staffName={staffName} linkFor={linkFor} />
        </section>
        {offline ? (
          <p id={OFFLINE_REASON_ID} className="text-xs font-medium text-destructive">
            {OFFLINE_MESSAGE}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {value.shiftId ? (
            <Button
              variant="destructive"
              className="min-h-11"
              onClick={onDelete}
              disabled={saving || offline}
              title={offline ? OFFLINE_MESSAGE : undefined}
              aria-describedby={offline ? OFFLINE_REASON_ID : undefined}
            >
              Delete
            </Button>
          ) : null}
          <div className="flex-1" />
          <Button variant="secondary" className="min-h-11" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="min-h-11"
            onClick={onSave}
            disabled={blocked || settling || saving || offline || shiftFormInterval(value) === null}
            title={offline ? OFFLINE_MESSAGE : undefined}
            aria-describedby={offline ? OFFLINE_REASON_ID : undefined}
          >
            Save
          </Button>
        </div>
      </div>
    ) : null}
  </Sheet>
)
