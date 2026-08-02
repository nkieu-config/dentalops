import { Columns3 } from "lucide-react"
import { useState } from "react"
import { Button } from "../../components/ui/button"
import { Sheet } from "../../components/ui/sheet"
import type { TimelineColumn } from "./use-column-mode"

interface ColumnPickerProps {
  columns: TimelineColumn[]
  hidden: ReadonlySet<string>
  onToggle: (columnId: string) => void
}

export const ColumnPicker = ({ columns, hidden, onToggle }: ColumnPickerProps) => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Columns3 className="h-4 w-4" />
        Columns
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Columns" side="bottom">
        <ul className="space-y-1">
          {columns.map((column) => (
            <li key={column.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-accent">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={!hidden.has(column.id)}
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
