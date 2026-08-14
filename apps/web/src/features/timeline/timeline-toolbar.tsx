import type { Branch } from "@dentalops/contracts"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "../../components/ui/button"
import { PageTitle } from "../../components/ui/page-header"
import { AppSelect } from "../../components/ui/app-select"
import { DatePicker } from "../../components/ui/date-picker"
import { SegmentedControl } from "../../components/ui/segmented-control"
import { Tooltip } from "../../components/ui/tooltip"
import { cn } from "../../lib/cn"
import { searchShortcutLabel } from "../../lib/shortcut-label"
import { bkkShiftDate, bkkToday, bkkWeekStart, fmtCompactDay, fmtScheduleDay } from "./lib/geometry"

export type TimelineView = "day" | "week"

const VIEW_OPTIONS = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
]

const SearchButton = ({ onSearch, shortcut }: { onSearch: () => void; shortcut: string }) => (
  <Tooltip content={`Search this schedule (${shortcut})`}>
    <Button
      variant="secondary"
      size="sm"
      onClick={onSearch}
      aria-label="Search this schedule"
      aria-keyshortcuts="Meta+K Control+K"
      className="min-w-11 shrink-0 border border-border bg-background px-0 text-muted-foreground hover:text-foreground sm:w-auto sm:px-3 lg:min-w-28"
    >
      <Search className="h-4 w-4" aria-hidden="true" />
      <span className="hidden lg:inline">Search</span>
    </Button>
  </Tooltip>
)

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
  children,
}: ToolbarProps) => {
  const step = view === "week" ? 7 : 1
  const label =
    view === "week" ? `Week of ${fmtScheduleDay(bkkWeekStart(date))}` : fmtScheduleDay(date)
  const today = bkkToday()
  const isToday = date === today
  const searchShortcut = searchShortcutLabel()

  return (
    <header className="shrink-0 p-2 pb-0 sm:p-3 sm:pb-0">
      <div
        data-testid="timeline-command-surface"
        className="overflow-hidden rounded-hero border border-border bg-card shadow-xs"
      >
        <div
          data-testid="timeline-command-layout"
          className="flex flex-col gap-2 px-3 py-2 sm:px-4 [@media(max-height:600px)]:gap-1 [@media(max-height:600px)]:py-1"
        >
          <div
            data-testid="timeline-command-context"
            className="flex min-w-0 items-center gap-2 sm:gap-3"
          >
            <PageTitle className="sr-only text-foreground sm:not-sr-only">Timeline</PageTitle>
            <AppSelect
              variant="toolbar"
              aria-label="Branch"
              prefix="Branch"
              className="w-full min-w-0 sm:w-60 sm:max-w-72 lg:w-64"
              value={branchId ?? ""}
              onValueChange={(nextBranchId) => onChange({ branchId: nextBranchId })}
              options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            />
            {primaryAction ? (
              <div data-testid="timeline-primary-action" className="ml-auto shrink-0">
                {primaryAction}
              </div>
            ) : null}
          </div>

          <div
            data-testid="timeline-schedule-row"
            className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 pt-2 lg:border-t-0 lg:pt-0"
          >
          <div
            data-testid="timeline-date-controls"
            className="grid min-w-0 flex-1 grid-cols-[auto_2.75rem_minmax(0,1fr)_2.75rem_auto] items-center gap-2 sm:min-w-76 lg:max-w-lg"
          >
            <Button
              variant="secondary"
              size="sm"
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "min-h-11",
                isToday && "bg-primary-surface text-primary-on-surface hover:bg-accent",
              )}
              onClick={() => onChange({ date: today })}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={view === "week" ? "Previous week" : "Previous day"}
              className="min-w-11 shrink-0"
              onClick={() => onChange({ date: bkkShiftDate(date, -step) })}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <DatePicker
              date={date}
              onChange={(nextDate) => onChange({ date: nextDate })}
              label="Choose schedule date"
              triggerLabel={label}
              compactTriggerLabel={fmtCompactDay(date)}
              className="min-w-0 max-sm:w-full max-sm:px-2"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={view === "week" ? "Next week" : "Next day"}
              className="min-w-11 shrink-0"
              onClick={() => onChange({ date: bkkShiftDate(date, step) })}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            {onSearch ? (
              <div data-testid="timeline-search-action" className="justify-self-end">
                <SearchButton onSearch={onSearch} shortcut={searchShortcut} />
              </div>
            ) : null}
          </div>

          <div
            data-testid="timeline-mode-actions"
            className="hidden min-w-0 flex-wrap items-center gap-2 md:flex xl:ml-auto"
          >
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
          </div>
        </div>
      </div>
    </header>
  )
}
