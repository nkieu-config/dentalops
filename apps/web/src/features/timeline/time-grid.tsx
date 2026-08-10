import { subtract, type Interval } from "@dentalops/availability"
import type { Appointment, Shift } from "@dentalops/contracts"
import { ReactNode, useEffect, useMemo, useRef } from "react"
import { cn } from "../../lib/cn"
import { useNow } from "./hooks"
import {
  DAY_MS,
  bkkDate,
  bkkDayStart,
  bkkToday,
  fmtTime,
  fmtWeekdayShort,
  msToY
} from "./lib/geometry"
import type { TimelineColumn } from "./use-column-mode"
import { useVisibleRange } from "./use-visible-range"

const GRID_HEIGHT = 24 * 64

const gridBackground = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, var(--grid-line-hour) 0px, var(--grid-line-hour) 1px, transparent 1px, transparent 64px), repeating-linear-gradient(to bottom, var(--grid-line) 0px, var(--grid-line) 1px, transparent 1px, transparent 16px)"
}

const toInterval = (row: { startsAt: string; endsAt: string }): Interval => ({
  start: Date.parse(row.startsAt),
  end: Date.parse(row.endsAt)
})

export interface ColumnMeta {
  hue?: number
  load?: string
}

interface TimeGridProps {
  date: string
  columns: TimelineColumn[]
  columnOf: (appointment: Appointment) => string | null
  columnDate?: (column: TimelineColumn) => string
  columnKind?: "resource" | "day"
  columnMeta?: (column: TimelineColumn) => ColumnMeta | undefined
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
  columnDate,
  columnKind = "resource",
  columnMeta,
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
  const dayStartOf = (ms: number) => bkkDayStart(bkkDate(ms))
  const dateOf = (column: TimelineColumn) => columnDate?.(column) ?? date
  const today = bkkToday()
  const todayInView = columns.some((column) => dateOf(column) === today)
  const now = useNow(todayInView)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 8 * 64 - 16 })
  }, [date])

  const offShiftByColumn = useMemo(() => {
    const map = new Map<string, Interval[]>()
    for (const column of columns) {
      if (column.staffId === undefined) continue
      const columnDayStart = bkkDayStart(dateOf(column))
      const day: Interval = { start: columnDayStart, end: columnDayStart + DAY_MS }
      const own = shifts.filter((s) => s.staffId === column.staffId).map(toInterval)
      map.set(column.id, subtract([day], own))
    }
    return map
  }, [columns, shifts, date, columnDate])

  const visible = useMemo(
    () =>
      appointments.filter((a) => {
        const ownDayStart = dayStartOf(Date.parse(a.startsAt))
        const top = msToY(Date.parse(a.startsAt), ownDayStart)
        const bottom = msToY(Date.parse(a.endsAt), ownDayStart)
        return bottom >= range.top && top <= range.bottom
      }),
    [appointments, range]
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
          {columns.map((column) => {
            const meta = columnMeta?.(column)
            const colDate = dateOf(column)
            const ringColor = meta?.hue !== undefined ? `var(--hue${meta.hue}-border)` : undefined
            return (
              <div
                key={column.id}
                className={cn(
                  "flex items-center gap-2 border-r border-border px-3 py-2 text-sm font-semibold text-foreground min-w-0 flex-1",
                  columnWidth
                )}
              >
                {columnKind === "day" ? (
                  <div className="flex w-full flex-col items-center gap-0.5">
                    <span className="text-meta font-medium uppercase tracking-wide text-muted-foreground">
                      {fmtWeekdayShort(colDate)}
                    </span>
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full tabular-nums",
                        colDate === today ? "bg-primary text-primary-foreground" : "text-foreground"
                      )}
                    >
                      {colDate.slice(8, 10)}
                    </span>
                  </div>
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-meta font-bold text-secondary-foreground"
                      style={
                        ringColor
                          ? { boxShadow: `0 0 0 2px var(--card), 0 0 0 3.5px ${ringColor}` }
                          : undefined
                      }
                    >
                      {column.name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").charAt(0).toUpperCase() || "C"}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate">{column.name}</span>
                      {meta?.load ? (
                        <span className="text-meta font-normal tabular-nums text-muted-foreground">
                          {meta.load}
                        </span>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            )
          })}
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
              {todayInView ? (
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
            {columns.map((column) => {
              const columnDayStart = bkkDayStart(dateOf(column))
              const isTodayColumn = dateOf(column) === today
              return (
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
                        top: msToY(block.start, columnDayStart),
                        height: msToY(block.end, columnDayStart) - msToY(block.start, columnDayStart),
                        background: "var(--offshift)"
                      }}
                    />
                  ))}
                  {visible
                    .filter((a) => columnOf(a) === column.id)
                    .map((a) => renderAppointment(a, dayStartOf(Date.parse(a.startsAt))))}
                  {columnOverlay?.(column, columnDayStart)}
                  {columnPreview?.(column, columnDayStart)}
                  {isTodayColumn ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 h-px"
                      data-testid="now-line"
                      style={{ top: msToY(now, columnDayStart), background: "var(--now-line)" }}
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
