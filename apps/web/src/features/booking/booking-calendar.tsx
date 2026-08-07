import { DayPicker } from "react-day-picker"

interface BookingCalendarProps {
  value: string
  onChange: (date: string) => void
}

const fromDate = (value: string) => new Date(`${value}T12:00:00`)

const toDateString = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`

export const BookingCalendar = ({ value, onChange }: BookingCalendarProps) => (
  <section aria-label="Choose appointment date" className="rounded-panel border border-border bg-card p-3 shadow-panel">
    <DayPicker
      mode="single"
      selected={fromDate(value)}
      onSelect={(date) => date && onChange(toDateString(date))}
      className="w-full"
      classNames={{
        month: "w-full",
        month_caption: "mb-3 text-center text-base font-semibold",
        nav: "flex items-center justify-between",
        button_previous:
          "flex h-11 w-11 items-center justify-center rounded-control hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        button_next:
          "flex h-11 w-11 items-center justify-center rounded-control hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        month_grid: "w-full border-collapse",
        weekdays: "text-muted-foreground",
        weekday: "h-10 text-center text-base font-medium",
        week: "w-full",
        day: "p-0 text-center",
        day_button:
          "mx-auto flex h-11 w-11 items-center justify-center rounded-control text-base tabular-nums hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected: "bg-primary text-primary-foreground",
        today: "font-bold text-primary",
        outside: "text-muted-foreground/50"
      }}
    />
  </section>
)
