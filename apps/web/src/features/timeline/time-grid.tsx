import { subtract, type Interval } from "@dentalops/availability"
import type { Appointment, Shift, StaffMember } from "@dentalops/contracts"
import { ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { DAY_MS, bkkDayStart, bkkToday, fmtTime, msToY } from "./lib/geometry"
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
  dentists: StaffMember[]
  shifts: Shift[]
  appointments: Appointment[]
  renderAppointment: (appointment: Appointment, dayStart: number) => ReactNode
  columnOverlay?: (dentist: StaffMember, dayStart: number) => ReactNode
  columnPreview?: (dentist: StaffMember, dayStart: number) => ReactNode
  columnRef?: (dentistId: string, element: HTMLDivElement | null) => void
}

const useNow = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export const TimeGrid = ({
  date,
  dentists,
  shifts,
  appointments,
  renderAppointment,
  columnOverlay,
  columnPreview,
  columnRef
}: TimeGridProps) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const range = useVisibleRange(scrollRef)
  const dayStart = bkkDayStart(date)
  const isToday = date === bkkToday()
  const now = useNow(isToday)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 8 * 64 - 16 })
  }, [date])

  const offShiftByDentist = useMemo(() => {
    const day: Interval = { start: dayStart, end: dayStart + DAY_MS }
    const map = new Map<string, Interval[]>()
    for (const dentist of dentists) {
      const own = shifts.filter((s) => s.staffId === dentist.id).map(toInterval)
      map.set(dentist.id, subtract([day], own))
    }
    return map
  }, [dentists, shifts, dayStart])

  const visible = useMemo(
    () =>
      appointments.filter((a) => {
        const top = msToY(Date.parse(a.startsAt), dayStart)
        const bottom = msToY(Date.parse(a.endsAt), dayStart)
        return bottom >= range.top && top <= range.bottom
      }),
    [appointments, dayStart, range]
  )

  return (
    <div ref={scrollRef} data-testid="timegrid-scroll" className="min-h-0 flex-1 overflow-auto">
      <div className="flex min-w-fit">
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
                className="absolute right-1 z-10 -translate-y-1/2 rounded-sm px-1 text-[0.65rem] font-medium text-white tabular-nums"
                style={{ top: msToY(now, dayStart), background: "var(--now-line)" }}
              >
                {fmtTime(now)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="relative flex flex-1" style={{ height: GRID_HEIGHT, ...gridBackground }}>
          {dentists.map((dentist) => (
            <div
              key={dentist.id}
              ref={(element) => columnRef?.(dentist.id, element)}
              data-testid={`col-${dentist.id}`}
              className="relative min-w-col-min flex-1 border-r border-border"
            >
              {(offShiftByDentist.get(dentist.id) ?? []).map((block) => (
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
                .filter((a) => a.dentistId === dentist.id)
                .map((a) => renderAppointment(a, dayStart))}
              {columnOverlay?.(dentist, dayStart)}
              {columnPreview?.(dentist, dayStart)}
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
  )
}
