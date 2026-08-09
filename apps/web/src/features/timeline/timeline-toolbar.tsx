import type { Branch } from "@dentalops/contracts"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "../../components/ui/button"
import { NativeSelect } from "../../components/ui/native-select"
import { bkkShiftDate, bkkToday, fmtDay } from "./lib/geometry"

interface ToolbarProps {
  date: string
  branchId: string | undefined
  branches: Branch[]
  onChange: (next: { date?: string; branchId?: string }) => void
  children?: ReactNode
}

export const TimelineToolbar = ({ date, branchId, branches, onChange, children }: ToolbarProps) => (
  <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5 sm:gap-4 md:px-6 md:py-3">
    <NativeSelect
      aria-label="Branch"
      className="w-auto"
      value={branchId ?? ""}
      onChange={(e) => onChange({ branchId: e.target.value })}
    >
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </NativeSelect>
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous day"
        onClick={() => onChange({ date: bkkShiftDate(date, -1) })}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span className="min-w-40 text-center text-sm font-medium tabular-nums">{fmtDay(date)}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next day"
        onClick={() => onChange({ date: bkkShiftDate(date, 1) })}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
    <Button variant="secondary" size="sm" onClick={() => onChange({ date: bkkToday() })}>
      Today
    </Button>
    <div className="flex-1" />
    {children}
  </div>
)
