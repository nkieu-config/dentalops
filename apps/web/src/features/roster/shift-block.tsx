import type { Shift } from "@dentalops/contracts"
import { OctagonAlert, Repeat } from "lucide-react"
import { cn } from "../../lib/cn"
import { fmtTime } from "../timeline/lib/geometry"

interface ShiftBlockProps {
  shift: Shift
  staffName: string
  onEdit: (shift: Shift) => void
  conflicting?: boolean
  dragging?: boolean
}

export const ShiftBlock = ({
  shift,
  staffName,
  onEdit,
  conflicting = false,
  dragging = false
}: ShiftBlockProps) => {
  const start = Date.parse(shift.startsAt)
  const end = Date.parse(shift.endsAt)

  return (
    <button
      type="button"
      data-testid={`shift-${shift.id}`}
      data-conflicting={conflicting ? "true" : undefined}
      onClick={() => onEdit(shift)}
      aria-label={`Edit ${staffName} shift ${fmtTime(start)} to ${fmtTime(end)}`}
      className={cn(
        "flex min-h-11 w-full flex-col items-start justify-center rounded-sm border border-border bg-secondary px-1.5 py-1 text-left text-xs leading-tight text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        conflicting && "ring-2 ring-destructive",
        dragging && "border-dashed opacity-60"
      )}
    >
      <span className="flex w-full items-center gap-1">
        <span className="font-medium tabular-nums">
          {fmtTime(start)}–{fmtTime(end)}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          {shift.seriesId ? <Repeat className="h-3 w-3" aria-label="Recurring" /> : null}
          {conflicting ? (
            <OctagonAlert className="h-3 w-3 text-destructive" aria-label="Blocking violation" />
          ) : null}
        </span>
      </span>
      {dragging ? <span className="text-muted-foreground">Validating…</span> : null}
    </button>
  )
}
