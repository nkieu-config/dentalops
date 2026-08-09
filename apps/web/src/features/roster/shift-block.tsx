import type { Shift } from "@dentalops/contracts"
import { OctagonAlert, Repeat } from "lucide-react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { cn } from "../../lib/cn"
import { fmtTime } from "../timeline/lib/geometry"

interface ShiftBlockProps {
  shift: Shift
  staffName: string
  onEdit: (shift: Shift) => void
  onMoveStart?: (e: ReactPointerEvent<Element>) => void
  conflicting?: boolean
  dragging?: boolean
}

export const ShiftBlock = ({
  shift,
  staffName,
  onEdit,
  onMoveStart,
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
      data-dragging={dragging ? "true" : undefined}
      onClick={() => onEdit(shift)}
      onPointerDown={onMoveStart}
      aria-label={`Edit ${staffName} shift ${fmtTime(start)} to ${fmtTime(end)}`}
      className={cn(
        "flex min-h-11 w-full flex-col items-start justify-center rounded-md border border-border bg-surface-subtle px-2 py-1.5 text-left text-xs leading-tight text-foreground transition-[background-color,box-shadow,border-color] duration-150 hover:bg-accent hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        onMoveStart && "cursor-grab",
        conflicting && "border-destructive bg-destructive-surface text-destructive-on-surface hover:bg-destructive-surface hover:border-destructive",
        dragging && "cursor-grabbing border-dashed opacity-60 shadow-lg"
      )}
    >
      <span className="flex w-full items-center gap-1">
        <span className="font-medium tabular-nums">
          {fmtTime(start)}–{fmtTime(end)}
        </span>
        <span className="ml-auto flex items-center gap-0.5">
          {shift.seriesId ? (
            <Repeat className="h-3 w-3" role="img" aria-label="Recurring" />
          ) : null}
          {conflicting ? (
            <OctagonAlert className="h-3 w-3 text-destructive" role="img" aria-label="Blocking violation" />
          ) : null}
        </span>
      </span>
      {dragging ? <span className="text-muted-foreground">Validating…</span> : null}
    </button>
  )
}
