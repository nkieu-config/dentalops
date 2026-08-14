import type { Shift } from "@dentalops/contracts"
import { GripVertical, OctagonAlert, Repeat } from "lucide-react"
import type { PointerEvent as ReactPointerEvent } from "react"
import { cn } from "../../lib/cn"
import { Tooltip } from "../../components/ui/tooltip"
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
    <div
      data-testid={`shift-${shift.id}`}
      data-conflicting={conflicting ? "true" : undefined}
      data-dragging={dragging ? "true" : undefined}
      className={cn(
        "group flex min-h-11 w-full items-stretch overflow-hidden rounded-control border border-border bg-surface-subtle text-left type-dense leading-tight text-foreground transition-[background-color,box-shadow,border-color] duration-150 hover:border-accent hover:bg-accent",
        conflicting && "border-destructive bg-destructive-surface text-destructive-on-surface hover:bg-destructive-surface hover:border-destructive",
        dragging && "border-dashed opacity-60 shadow-lg"
      )}
    >
      <button
        type="button"
        data-testid={`shift-edit-${shift.id}`}
        onClick={() => onEdit(shift)}
        aria-label={`Edit ${staffName} shift ${fmtTime(start)} to ${fmtTime(end)}`}
        className="flex min-w-0 flex-1 flex-col items-start justify-center gap-1 px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex w-full items-center gap-1">
          <span className="font-medium tabular-nums">
            {fmtTime(start)}–{fmtTime(end)}
          </span>
          <span className="ml-auto flex items-center gap-0.5">
            {shift.seriesId ? (
              <Tooltip content="Recurring shift">
                <span>
                  <Repeat className="h-3 w-3" role="img" aria-label="Recurring" />
                </span>
              </Tooltip>
            ) : null}
            {conflicting ? (
              <Tooltip content="Coverage needs attention">
                <span>
                  <OctagonAlert className="h-3 w-3 text-destructive" role="img" aria-label="Blocking violation" />
                </span>
              </Tooltip>
            ) : null}
          </span>
        </span>
        {dragging ? <span className="text-muted-foreground">Validating…</span> : null}
      </button>
      {onMoveStart ? (
        <button
          type="button"
          data-testid={`shift-drag-${shift.id}`}
          aria-label={`Move ${staffName} shift`}
          onPointerDown={onMoveStart}
          className="flex w-9 shrink-0 touch-none cursor-grab items-center justify-center border-l border-border text-muted-foreground hover:bg-surface-subtle active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
