import type { StaffMember } from "@dentalops/contracts"
import { Columns3 } from "lucide-react"
import { useState } from "react"
import { Button } from "../../components/ui/button"
import { Sheet } from "../../components/ui/sheet"

interface ColumnPickerProps {
  dentists: StaffMember[]
  hidden: ReadonlySet<string>
  onToggle: (dentistId: string) => void
}

export const ColumnPicker = ({ dentists, hidden, onToggle }: ColumnPickerProps) => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Columns3 className="h-4 w-4" />
        Columns
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="Columns" side="bottom">
        <ul className="space-y-1">
          {dentists.map((dentist) => (
            <li key={dentist.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-accent">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={!hidden.has(dentist.id)}
                  onChange={() => onToggle(dentist.id)}
                />
                {dentist.name}
              </label>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  )
}
