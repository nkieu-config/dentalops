import type { Appointment, StaffMember } from "@dentalops/contracts"
import * as ToggleGroup from "@radix-ui/react-toggle-group"
import { useMemo } from "react"

export const ALL_DENTISTS = "all"

interface AgendaFilterChipsProps {
  dentists: StaffMember[]
  appointments: Appointment[]
  value: string
  onValueChange: (value: string) => void
}

const firstName = (name: string): string =>
  name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").split(/\s+/)[0] ?? name

export const AgendaFilterChips = ({
  dentists,
  appointments,
  value,
  onValueChange,
}: AgendaFilterChipsProps) => {
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const appointment of appointments) {
      map.set(appointment.dentistId, (map.get(appointment.dentistId) ?? 0) + 1)
    }
    return map
  }, [appointments])

  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => next && onValueChange(next)}
      aria-label="Dentist"
      data-testid="agenda-filter-chips"
      className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ToggleGroup.Item
        value={ALL_DENTISTS}
        aria-label={`All dentists, ${appointments.length} appointments`}
        className="min-h-11 shrink-0 touch-manipulation rounded-full border border-border px-3 type-ui font-semibold text-muted-foreground transition-[background-color,color] duration-150 hover:bg-accent data-[state=on]:border-primary data-[state=on]:bg-primary-surface data-[state=on]:text-primary-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        All
      </ToggleGroup.Item>
      {dentists.map((dentist) => {
        const count = counts.get(dentist.id) ?? 0
        return (
          <ToggleGroup.Item
            key={dentist.id}
            value={dentist.id}
            aria-label={`${dentist.name}, ${count} ${count === 1 ? "appointment" : "appointments"}`}
            className="flex min-h-11 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border border-border px-3 type-ui font-medium text-muted-foreground transition-[background-color,color] duration-150 hover:bg-accent data-[state=on]:border-primary data-[state=on]:bg-primary-surface data-[state=on]:text-primary-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span aria-hidden="true">{firstName(dentist.name)}</span>
            <span
              aria-hidden="true"
              className="type-meta tabular-nums opacity-70"
            >
              {count}
            </span>
          </ToggleGroup.Item>
        )
      })}
    </ToggleGroup.Root>
  )
}
