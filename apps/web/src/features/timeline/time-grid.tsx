import { subtract, type Interval } from "@dentalops/availability"
import type { Appointment, Shift } from "@dentalops/contracts"
import { ReactNode, useEffect, useMemo, useRef } from "react"
import { cn } from "../../lib/cn"
import { useNow } from "./hooks"
import { DAY_MS, bkkDayStart, bkkToday, fmtTime, msToY } from "./lib/geometry"
import type { TimelineColumn } from "./use-column-mode"
import { useVisibleRange } from "./use-visible-range"

const GRID_HEIGHT = 24 * 64

const gridBackground = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, var(--grid-line-hour) 0px, var(--grid-line-hour) 1px, transparent 1px, transparent 64px), repeating-linear-gradient(to bottom, var(--grid-line) 0px, var(--grid-line) 1px, transparent 1px, transparent 16px)"
}

const stripeBackground = {
  backgroundImage:
    "repeating-linear-gradient(45deg, var(--offshift) 0px, var(--offshift) 6px, var(--offshift-stripe) 6px, var(--offshift-stripe) 7px)"
}

const toInterval = (row: { startsAt: string; endsAt: string }): Interval => ({
  start: Date.parse(row.startsAt),
  end: Date.parse(row.endsAt)
})

interface TimeGridProps {
  date: string
  columns: TimelineColumn[]
  columnOf: (appointment: Appointment) => string | null
  shifts: Shift[]
  appointments: Appointment[]
  renderAppointment: (appointment: Appointment, dayStart: number) => ReactNode
  columnOverlay?: (column: TimelineColumn, dayStart: number) => ReactNode
  columnPreview?: (column: TimelineColumn, dayStart: number) => ReactNode
  columnRef?: (columnId: string, element: HTMLDivElement | null) => void
  snap?: boolean
}

export const TimeGrid = ({
  date,
  columns,
  columnOf,
  shifts,
  appointments,
  renderAppointment,
  columnOverlay,
  columnPreview,
  columnRef,
  snap = false
}: TimeGridProps) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const range = useVisibleRange(scrollRef)
  const dayStart = bkkDayStart(date)
  const isToday = date === bkkToday()
  const now = useNow(isToday)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 8 * 64 - 16 })
  }, [date])

  const offShiftByColumn = useMemo(() => {
    const day: Interval = { start: dayStart, end: dayStart + DAY_MS }
    const map = new Map<string, Interval[]>()
    for (const column of columns) {
      if (column.staffId === undefined) continue
      const own = shifts.filter((s) => s.staffId === column.staffId).map(toInterval)
      map.set(column.id, subtract([day], own))
    }
    return map
  }, [columns, shifts, dayStart])

  const visible = useMemo(
    () =>
      appointments.filter((a) => {
        const top = msToY(Date.parse(a.startsAt), dayStart)
        const bottom = msToY(Date.parse(a.endsAt), dayStart)
        return bottom >= range.top && top <= range.bottom
      }),
    [appointments, dayStart, range]
  )

  const columnWidth = snap ? "min-w-col-md" : "min-w-col-min"

  return (
    <div
      ref={scrollRef}
      data-testid="timegrid-scroll"
      tabIndex={0}
      role="region"
      aria-label="Appointment timeline"
      className={cn(
        "min-h-0 flex-1 overflow-auto",
        snap && "snap-x snap-mandatory scroll-pl-timegutter"
      )}
    >
      <div className="min-w-fit">
        <div className="sticky top-0 z-30 flex border-b border-border bg-card">
          <div className="sticky left-0 z-10 w-timegutter shrink-0 border-r border-border bg-card" />
          {columns.map((column) => (
            <div
              key={column.id}
              className={cn("flex items-center gap-2 border-r border-border px-3 py-2 text-sm font-semibold text-foreground min-w-0 flex-1", columnWidth)}
            >
              <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-meta font-bold text-secondary-foreground">
                {column.name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").charAt(0).toUpperCase() || "C"}
              </span>
              <span className="truncate">{column.name}</span>
            </div>
          ))}
        </div>
        <div className="flex">
          <div
            className="sticky left-0 z-20 w-timegutter shrink-0 bg-background"
            style={{ height: GRID_HEIGHT }}
          >
            <div className="relative h-full border-r border-border">
              {Array.from({ length: 24 }, (_, hour) => (
                <span
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
                  style={{ top: hour * 64 }}
                >
                  {String(hour).padStart(2, "0")}:00
                </span>
              ))}
              {isToday ? (
                <span
                  className="absolute right-1 z-10 -translate-y-1/2 rounded-sm bg-destructive px-1 text-meta font-medium text-destructive-foreground tabular-nums"
                  style={{ top: msToY(now, dayStart) }}
                >
                  {fmtTime(now)}
                </span>
              ) : null}
            </div>
          </div>
          <div className="relative flex flex-1" style={{ height: GRID_HEIGHT, ...gridBackground }}>
            {columns.map((column) => (
              <div
                key={column.id}
                ref={(element) => columnRef?.(column.id, element)}
                data-testid={`col-${column.id}`}
                className={cn(
                  "relative flex-1 border-r border-border",
                  columnWidth,
                  snap && "snap-start"
                )}
              >
                {(offShiftByColumn.get(column.id) ?? []).map((block) => (
                  <div
                    key={block.start}
                    data-testid="offshift"
                    className="absolute inset-x-0"
                    style={{
                      top: msToY(block.start, dayStart),
                      height: msToY(block.end, dayStart) - msToY(block.start, dayStart),
                      ...stripeBackground
                    }}
                  />
                ))}
                {visible
                  .filter((a) => columnOf(a) === column.id)
                  .map((a) => renderAppointment(a, dayStart))}
                {columnOverlay?.(column, dayStart)}
                {columnPreview?.(column, dayStart)}
              </div>
            ))}
            {isToday ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 h-px"
                data-testid="now-line"
                style={{ top: msToY(now, dayStart), background: "var(--now-line)" }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
