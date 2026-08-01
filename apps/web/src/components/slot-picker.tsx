import { availabilityResponseSchema, type AvailabilitySlot } from "@dentalops/contracts"
import { useQuery } from "@tanstack/react-query"
import { CalendarX, ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo } from "react"
import {
  DAY_MS,
  bkkDayStart,
  bkkShiftDate,
  fmtDay,
  fmtTime
} from "../features/timeline/lib/geometry"
import { api } from "../lib/api"
import { Button } from "./ui/button"
import { EmptyState } from "./ui/empty-state"
import { Skeleton } from "./ui/skeleton"

interface SlotPickerProps {
  serviceId: string
  branchId: string
  dentistId?: string
  date: string
  onPick: (startsAtIso: string) => void
  onDateChange: (isoDate: string) => void
}

interface SlotGroup {
  key: string
  label: string
  slots: AvailabilitySlot[]
}

const isMorning = (startsAt: string) => Number(fmtTime(Date.parse(startsAt)).slice(0, 2)) < 12

export const SlotPicker = ({
  serviceId,
  branchId,
  dentistId,
  date,
  onPick,
  onDateChange
}: SlotPickerProps) => {
  const dayStart = bkkDayStart(date)
  const availability = useQuery({
    queryKey: ["availability", serviceId, branchId, dentistId, date],
    queryFn: () =>
      api("/availability", availabilityResponseSchema, {
        query: {
          serviceId,
          branchId,
          dentistId,
          from: new Date(dayStart).toISOString(),
          to: new Date(dayStart + DAY_MS).toISOString()
        }
      })
  })

  const groups = useMemo<SlotGroup[]>(() => {
    const slots = (availability.data?.slots ?? [])
      .filter((s) => dentistId === undefined || s.dentistId === dentistId)
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    return [
      { key: "morning", label: "Morning", slots: slots.filter((s) => isMorning(s.startsAt)) },
      { key: "afternoon", label: "Afternoon", slots: slots.filter((s) => !isMorning(s.startsAt)) }
    ].filter((group) => group.slots.length > 0)
  }, [availability.data, dentistId])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Previous day of slots"
          onClick={() => onDateChange(bkkShiftDate(date, -1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium tabular-nums">{fmtDay(date)}</span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Next day of slots"
          onClick={() => onDateChange(bkkShiftDate(date, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {availability.isPending ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} data-testid="slot-skeleton" className="h-11 w-20" />
          ))}
        </div>
      ) : null}
      {availability.isError ? (
        <EmptyState icon={CalendarX} title="Could not load free slots" hint="Retry shortly" />
      ) : null}
      {availability.isSuccess && groups.length === 0 ? (
        <EmptyState icon={CalendarX} title="No free slots this day" hint="Try another day" />
      ) : null}
      {groups.map((group) => (
        <div key={group.key} data-testid={`group-${group.key}`} className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.slots.map((s) => (
              <button
                key={s.startsAt}
                type="button"
                data-testid="slot"
                onClick={() => onPick(s.startsAt)}
                className="min-h-11 min-w-20 cursor-pointer rounded-md border border-border px-3 text-sm tabular-nums hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {fmtTime(Date.parse(s.startsAt))}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
