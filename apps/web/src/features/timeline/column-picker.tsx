import { Columns3 } from "lucide-react"
import { useState } from "react"
import { Button } from "../../components/ui/button"
import { Checkbox } from "../../components/ui/checkbox"
import { Sheet } from "../../components/ui/sheet"
import type { TimelineColumn } from "./use-column-mode"

interface ColumnPickerProps {
  columns: TimelineColumn[]
  hidden: ReadonlySet<string>
  onToggle: (columnId: string) => void
  onSetHidden: (hidden: ReadonlySet<string>) => void
}

export const ColumnPicker = ({ columns, hidden, onToggle, onSetHidden }: ColumnPickerProps) => {
  const [open, setOpen] = useState(false)
  const visibleCount = columns.filter((column) => !hidden.has(column.id)).length

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
    aria-label={`Columns · ${visibleCount} of ${columns.length}`}
        onClick={() => setOpen(true)}
      >
        <Columns3 className="h-4 w-4" aria-hidden="true" />
        <span aria-hidden="true" className="tabular-nums">
          <span className="hidden xl:inline">Columns · </span>
          {`${visibleCount}/${columns.length}`}
        </span>
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Columns"
        side="bottom"
        footer={<Button className="w-full" onClick={() => setOpen(false)}>Done</Button>}
      >
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-3">
          <p className="type-supporting text-muted-foreground">Choose the columns to keep in view.</p>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onSetHidden(new Set())}>
  Show all
            </Button>
            <Button
  variant="ghost"
  size="sm"
  disabled={columns.length === 0}
  onClick={() => onSetHidden(new Set(columns.slice(1).map((column) => column.id)))}
            >
  Show first only
            </Button>
          </div>
        </div>
        <ul className="space-y-1">
          {columns.map((column) => (
            <li key={column.id}>
  <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-2 type-ui hover:bg-accent">
    <Checkbox
      checked={!hidden.has(column.id)}
      disabled={!hidden.has(column.id) && visibleCount === 1}
      onChange={() => onToggle(column.id)}
    />
    {column.name}
  </label>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}
