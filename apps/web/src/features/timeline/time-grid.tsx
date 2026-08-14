import { subtract, type Interval } from "@dentalops/availability"
import type { Appointment, Shift } from "@dentalops/contracts"
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react"
import { ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "../../lib/cn"
import { Tooltip } from "../../components/ui/tooltip"
import { useNow } from "./hooks"
import {
  DAY_MS,
  FULL_DAY_WINDOW,
  MINUTES_PER_DAY,
  PX_PER_MIN,
  bkkDate,
  bkkDayStart,
  bkkToday,
  fmtTime,
  fmtWeekdayShort,
  initialTimelineMinute,
  msToY,
  timelineWindow,
  type TimelineWindow,
} from "./lib/geometry"
import { columnLoad, describeLoad, type ColumnLoad } from "./lib/capacity"
import type { OpenSpan } from "./lib/opening-hours"
import type { TimelineColumn } from "./use-column-mode"
import { useHorizontalOverflow } from "./use-horizontal-overflow"
import { useVisibleRange } from "./use-visible-range"

const MINUTE_MS = 60_000

const gridBackground = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, var(--timeline-hour-line) 0px, var(--timeline-hour-line) 1px, transparent 1px, transparent var(--spacing-hour))",
}

const toInterval = (row: { startsAt: string; endsAt: string }): Interval => ({
  start: Date.parse(row.startsAt),
  end: Date.parse(row.endsAt),
})

const dayStartOf = (ms: number) => bkkDayStart(bkkDate(ms))

interface PlacedAppointment {
  appointment: Appointment
  origin: number
}

export interface ColumnMeta {
  hue?: number
}

interface TimeGridProps {
  date: string
  columns: TimelineColumn[]
  columnOf: (appointment: Appointment) => string | null
  columnDate?: (column: TimelineColumn) => string
  columnKind?: "resource" | "day"
  resourceKind?: "dentist" | "chair"
  resourceContext?: string
  columnMeta?: (column: TimelineColumn) => ColumnMeta | undefined
  shifts: Shift[]
  appointments: Appointment[]
  renderAppointment: (appointment: Appointment, dayStart: number) => ReactNode
  columnOverlay?: (column: TimelineColumn, dayStart: number) => ReactNode
  columnPreview?: (column: TimelineColumn, dayStart: number) => ReactNode
  columnRef?: (columnId: string, element: HTMLDivElement | null) => void
  onColumnsOverflow?: (overflowing: boolean) => void
  emptyNotice?: ReactNode
  snap?: boolean
  showOffShift?: boolean
  openHours?: (isoDate: string) => OpenSpan[]
}

export const TimeGrid = ({
  date,
  columns,
  columnOf,
  columnDate,
  columnKind = "resource",
  resourceKind = "dentist",
  resourceContext,
  columnMeta,
  shifts,
  appointments,
  renderAppointment,
  columnOverlay,
  columnPreview,
  columnRef,
  onColumnsOverflow,
  emptyNotice,
  snap = false,
  showOffShift = true,
  openHours,
}: TimeGridProps) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const range = useVisibleRange(scrollRef)
  const edges = useHorizontalOverflow(scrollRef)
  const [fullDay, setFullDay] = useState(false)
  const dateOf = (column: TimelineColumn) => columnDate?.(column) ?? date
  const today = bkkToday()
  const todayInView = columns.some((column) => dateOf(column) === today)
  const now = useNow(todayInView)

  const measured = useMemo(
    () => timelineWindow(showOffShift ? shifts : [], appointments),
    [showOffShift, shifts, appointments],
  )
  const held = useRef<{ key: string; view: TimelineWindow } | null>(null)
  const loaded = shifts.length > 0 || appointments.length > 0
  if (loaded) {
    held.current =
      held.current?.key === date
        ? {
            key: date,
            view: {
              startMin: Math.min(held.current.view.startMin, measured.startMin),
              endMin: Math.max(held.current.view.endMin, measured.endMin),
            },
          }
        : { key: date, view: measured }
  }
  const clinicWindow = loaded && held.current ? held.current.view : measured
  const view = fullDay ? FULL_DAY_WINDOW : clinicWindow
  const canvasHeight = (view.endMin - view.startMin) * PX_PER_MIN
  const originOf = (columnDayStart: number) => columnDayStart + view.startMin * MINUTE_MS
  const origin = originOf(bkkDayStart(date))
  const hiddenHours = MINUTES_PER_DAY / 60 - (view.endMin - view.startMin) / 60
  const nowMinute = (now - bkkDayStart(bkkDate(now))) / MINUTE_MS
  const nowInView = nowMinute >= view.startMin && nowMinute <= view.endMin

  useEffect(() => {
    const target = initialTimelineMinute(date, Date.now(), shifts)
    const anchor = target > view.endMin ? view.startMin : target
    scrollRef.current?.scrollTo({
      top: Math.max(0, (anchor - view.startMin) * PX_PER_MIN - 16),
    })
  }, [date, shifts, view.startMin, view.endMin])

  const overflowing = edges.start || edges.end
  useEffect(() => {
    onColumnsOverflow?.(overflowing)
  }, [overflowing, onColumnsOverflow])

  const openByColumn = useMemo(() => {
    const map = new Map<string, OpenSpan[] | null>()
    for (const column of columns) {
      map.set(
        column.id,
        column.staffId !== undefined
          ? shifts.filter((shift) => shift.staffId === column.staffId)
          : (openHours?.(dateOf(column)) ?? null),
      )
    }
    return map
  }, [columns, shifts, openHours, date, columnDate])

  const offShiftByColumn = useMemo(() => {
    const map = new Map<string, Interval[]>()
    for (const column of columns) {
      const open = openByColumn.get(column.id)
      if (!open) continue
      const columnDayStart = bkkDayStart(dateOf(column))
      const day: Interval = { start: columnDayStart, end: columnDayStart + DAY_MS }
      const visible = {
        start: columnDayStart + view.startMin * MINUTE_MS,
        end: columnDayStart + view.endMin * MINUTE_MS,
      }
      const clipped = subtract([day], open.map(toInterval)).flatMap((block) => {
        const start = Math.max(block.start, visible.start)
        const end = Math.min(block.end, visible.end)
        return end > start ? [{ start, end }] : []
      })
      map.set(column.id, clipped)
    }
    return map
  }, [columns, openByColumn, date, columnDate, view.startMin, view.endMin])

  const loadByColumn = useMemo(() => {
    const map = new Map<string, ColumnLoad>()
    if (columnKind === "day") return map
    const claimed = new Map<string, Appointment[]>()
    for (const appointment of appointments) {
      const columnId = columnOf(appointment)
      if (columnId === null) continue
      const bucket = claimed.get(columnId)
      if (bucket) bucket.push(appointment)
      else claimed.set(columnId, [appointment])
    }
    for (const column of columns) {
      map.set(
        column.id,
        columnLoad(claimed.get(column.id) ?? [], openByColumn.get(column.id) ?? []),
      )
    }
    return map
  }, [columnKind, columns, appointments, openByColumn, columnOf])

  const byColumn = useMemo(() => {
    const map = new Map<string, PlacedAppointment[]>()
    for (const appointment of appointments) {
      const startsAt = Date.parse(appointment.startsAt)
      const ownOrigin = originOf(dayStartOf(startsAt))
      const top = msToY(startsAt, ownOrigin)
      const bottom = msToY(Date.parse(appointment.endsAt), ownOrigin)
      if (bottom < range.top || top > range.bottom) continue
      const columnId = columnOf(appointment)
      if (columnId === null) continue
      const placed = { appointment, origin: ownOrigin }
      const bucket = map.get(columnId)
      if (bucket) bucket.push(placed)
      else map.set(columnId, [placed])
    }
    return map
  }, [appointments, range, columnOf, view.startMin])

  const columnWidth = snap ? "min-w-col-md" : "min-w-col-min"
  const unavailableLabel = resourceKind === "chair" ? "Closed" : "Not rostered"
  const resourceName = (column: TimelineColumn) => {
    const name = column.name.trim()
    if (resourceKind !== "chair" || !resourceContext) return name
    const context = resourceContext.trim()
    return name.toLocaleLowerCase().startsWith(`${context.toLocaleLowerCase()} `)
      ? name.slice(context.length).trimStart()
      : name
  }
  const resourceAvatar = (column: TimelineColumn) =>
    column.name
      .replace(/^(dr|mr|mrs|ms)\.?\s+/i, "")
      .charAt(0)
      .toUpperCase() || "C"

  return (
    <div data-testid="timegrid-frame" className="relative min-h-0 flex-1 p-2 sm:p-3">
      {emptyNotice ? (
        <div
          data-testid="timeline-empty-notice"
          className="pointer-events-none absolute inset-x-0 top-1/3 z-40 flex justify-center px-4"
        >
          <div className="pointer-events-auto max-w-sm rounded-card border border-border bg-card px-4 py-3 text-center shadow-xs">
            {emptyNotice}
          </div>
        </div>
      ) : null}
      {edges.start ? (
        <div
          aria-hidden="true"
          data-testid="timeline-more-start"
          className="pointer-events-none absolute bottom-2.25 left-[calc(var(--spacing-timegutter)+9px)] top-2.25 z-40 w-8 bg-linear-to-r from-timeline-canvas to-transparent sm:bottom-3.25 sm:left-[calc(var(--spacing-timegutter)+13px)] sm:top-3.25"
        />
      ) : null}
      {edges.end ? (
        <div
          aria-hidden="true"
          data-testid="timeline-more-end"
          className="pointer-events-none absolute bottom-2.25 right-2.25 top-2.25 z-40 w-8 rounded-r-timeline-shell bg-linear-to-l from-timeline-canvas to-transparent sm:bottom-3.25 sm:right-3.25 sm:top-3.25"
        />
      ) : null}
      <div
        ref={scrollRef}
        data-testid="timegrid-scroll"
        tabIndex={0}
        role="region"
        aria-label="Appointment timeline"
        className={cn(
          "h-full min-h-0 overflow-auto overscroll-contain rounded-timeline-shell border border-border bg-timeline-shell focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          snap && "snap-x snap-proximity scroll-pl-timegutter",
        )}
      >
        <div data-testid="timeline-shell" className="min-w-fit">
          <div
            className="sticky top-0 z-30 flex min-h-12 border-b border-timeline-resource-line bg-timeline-header"
            data-testid="timeline-header"
          >
            <div className="sticky left-0 z-20 flex w-timegutter shrink-0 items-center justify-center border-r border-timeline-resource-line bg-timeline-header">
              {hiddenHours > 0 || fullDay ? (
                <Tooltip
                  content={
                    fullDay
                      ? "Show clinic hours only"
                      : `Show the full day (${hiddenHours} more hours)`
                  }
                >
                  <button
                    type="button"
                    data-testid="full-day-toggle"
                    aria-pressed={fullDay}
                    aria-label={fullDay ? "Show clinic hours only" : "Show the full day"}
                    onClick={() => setFullDay((shown) => !shown)}
                    className="grid size-9 place-items-center rounded-control text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {fullDay ? (
                      <ChevronsDownUp className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </Tooltip>
              ) : null}
            </div>
            <div
              data-testid="timeline-header-rail"
              className="flex flex-1 divide-x divide-timeline-resource-line"
            >
              {columns.map((column) => {
                const meta = columnMeta?.(column)
                const colDate = dateOf(column)
                const load = loadByColumn.get(column.id)
                const ringColor = meta?.hue !== undefined ? `var(--hue${meta.hue}-border)` : undefined
                return (
                  <div
                    key={column.id}
                    data-testid={`resource-header-${column.id}`}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 type-ui font-medium text-foreground",
                      columnWidth,
                    )}
                  >
                    {columnKind === "day" ? (
                      <div className="flex w-full flex-col items-center gap-0.5">
                        <span className="type-meta font-medium uppercase tracking-wide text-muted-foreground">
                          {fmtWeekdayShort(colDate)}
                        </span>
                        <span
                          className={cn(
                            "flex size-6 items-center justify-center rounded-full tabular-nums",
                            colDate === today
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground",
                          )}
                        >
                          {colDate.slice(8, 10)}
                        </span>
                      </div>
                    ) : (
                      <>
                        {resourceKind === "chair" ? null : (
                          <span
                            aria-hidden="true"
                            data-testid={`resource-avatar-${column.id}`}
                            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary type-meta font-semibold text-secondary-foreground"
                            style={ringColor ? { boxShadow: `0 0 0 1.5px ${ringColor}` } : undefined}
                          >
                            {resourceAvatar(column)}
                          </span>
                        )}
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span
                            className={cn("min-w-0 truncate", resourceKind === "chair" && "font-semibold")}
                            title={column.name}
                          >
                            {resourceName(column)}
                          </span>
                          {load ? (
                            <span
                              data-testid={`resource-load-${column.id}`}
                              className="min-w-0 truncate type-meta font-normal text-muted-foreground tabular-nums"
                            >
                              {describeLoad(load, unavailableLabel)}
                            </span>
                          ) : null}
                        </span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="flex">
            <div
              className="sticky left-0 z-20 w-timegutter shrink-0 bg-timeline-header"
              style={{ height: canvasHeight }}
            >
              <div className="relative h-full border-r border-timeline-resource-line">
                {Array.from(
                  { length: (view.endMin - view.startMin) / 60 },
                  (_, index) => view.startMin / 60 + index,
                ).map((hour) => (
                  <span
                    key={hour}
                    className="absolute right-2 -translate-y-1/2 type-meta text-muted-foreground tabular-nums"
                    style={{ top: (hour * 60 - view.startMin) * PX_PER_MIN }}
                  >
                    {String(hour).padStart(2, "0")}:00
                  </span>
                ))}
                {todayInView && nowInView ? (
                  <span
                    className="absolute right-1 z-10 -translate-y-1/2 rounded-sm bg-timeline-current-time px-1 type-meta font-medium text-timeline-current-time-foreground tabular-nums"
                    style={{ top: msToY(now, origin) }}
                  >
                    {fmtTime(now)}
                  </span>
                ) : null}
              </div>
            </div>
            <div
              data-testid="timeline-canvas"
              className="relative z-0 flex flex-1 bg-timeline-canvas"
              style={{ height: canvasHeight, ...gridBackground }}
            >
              {columns.map((column) => {
                const columnOrigin = originOf(bkkDayStart(dateOf(column)))
                const isTodayColumn = dateOf(column) === today
                return (
                  <div
                    key={column.id}
                    ref={(element) => columnRef?.(column.id, element)}
                    data-testid={`col-${column.id}`}
                    className={cn(
                      "relative flex-1 border-r border-timeline-resource-line",
                      columnWidth,
                      snap && "snap-start",
                    )}
                  >
                    {showOffShift
                      ? (offShiftByColumn.get(column.id) ?? []).map((block) => {
                          const height =
                            msToY(block.end, columnOrigin) - msToY(block.start, columnOrigin)
                          return (
                            <div
                              key={block.start}
                              aria-hidden="true"
                              data-testid="offshift"
                              className="pointer-events-none absolute inset-x-0 bg-timeline-offshift"
                              style={{ top: msToY(block.start, columnOrigin), height }}
                            />
                          )
                        })
                      : null}
                    {(byColumn.get(column.id) ?? []).map((placed) =>
                      renderAppointment(placed.appointment, placed.origin),
                    )}
                    {columnOverlay?.(column, columnOrigin)}
                    {columnPreview?.(column, columnOrigin)}
                    {isTodayColumn && nowInView ? (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-1 h-px"
                        data-testid="now-line"
                        style={{
                          top: msToY(now, columnOrigin),
                          background: "var(--timeline-current-time)",
                        }}
                      />
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
