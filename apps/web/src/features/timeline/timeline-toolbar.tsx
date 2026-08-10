import type { Branch } from "@dentalops/contracts"
import { CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "../../components/ui/button"
import { NativeSelect } from "../../components/ui/native-select"
import { SegmentedControl } from "../../components/ui/segmented-control"
import { bkkShiftDate, bkkToday, bkkWeekStart, fmtDay } from "./lib/geometry"

export type TimelineView = "day" | "week"

const VIEW_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" }
]

interface ToolbarProps {
  date: string
  branchId: string | undefined
  branches: Branch[]
  view: TimelineView
  onChange: (next: { date?: string; branchId?: string; view?: TimelineView }) => void
  onSearch?: () => void
  showViewToggle?: boolean
  primaryAction?: ReactNode
  children?: ReactNode
}

export const TimelineToolbar = ({
  date,
  branchId,
  branches,
  view,
  onChange,
  onSearch,
  showViewToggle = true,
  primaryAction,
  children
}: ToolbarProps) => {
  const step = view === "week" ? 7 : 1
  const label = view === "week" ? `Week of ${fmtDay(bkkWeekStart(date))}` : fmtDay(date)

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-border bg-card px-4 py-2.5 md:px-6 md:py-3">
      <div className="flex flex-wrap items-center gap-3">
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
        <Button variant="ghost" size="sm" onClick={() => onChange({ date: bkkToday() })}>
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          Today
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={view === "week" ? "Previous week" : "Previous day"}
            onClick={() => onChange({ date: bkkShiftDate(date, -step) })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="min-w-28 text-center text-sm font-medium tabular-nums sm:min-w-40">
            {label}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={view === "week" ? "Next week" : "Next day"}
            onClick={() => onChange({ date: bkkShiftDate(date, step) })}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {showViewToggle || children ? (
        <>
          <div className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-3">
            {showViewToggle ? (
              <SegmentedControl
                ariaLabel="View"
                value={view}
                onValueChange={(next) => onChange({ view: next === "week" ? "week" : "day" })}
                options={VIEW_OPTIONS}
              />
            ) : null}
            {children}
          </div>
        </>
      ) : null}

      {onSearch ? (
        <>
          <div className="hidden h-6 w-px shrink-0 bg-border sm:block" aria-hidden="true" />
          <button
            type="button"
            onClick={onSearch}
            aria-label="Find a patient"
            className="flex min-h-9 items-center gap-2 rounded-control border border-border bg-background px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Find a patient</span>
            <kbd className="hidden rounded border border-border bg-card px-1.5 py-0.5 font-mono text-meta text-muted-foreground sm:inline">
              ⌘K
            </kbd>
          </button>
        </>
      ) : null}

      <div className="flex-1" />
      {primaryAction}
    </div>
  )
}
