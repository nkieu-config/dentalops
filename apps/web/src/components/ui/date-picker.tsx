import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { cn } from "../../lib/cn"
import { buttonVariants } from "./button"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

interface DatePickerProps {
  date: string
  onChange: (isoDate: string) => void
  label: string
  triggerLabel: string
}

const parseIsoDate = (iso: string): Date => {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year!, month! - 1, day!, 12)
}

const toIsoDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const dayPickerClassNames = {
  months: "relative",
  month_caption: "flex items-center justify-center h-9 text-sm font-semibold mb-1",
  nav: "absolute inset-x-0 top-0 flex h-9 items-center justify-between px-1",
  button_previous: "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent",
  button_next: "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent",
  month_grid: "border-collapse",
  weekdays: "flex",
  weekday: "h-9 w-9 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
  week: "flex",
  day: "p-0 text-center",
  day_button:
    "h-9 w-9 cursor-pointer rounded-full text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
  today: "[&>button]:font-bold [&>button]:text-primary",
  outside: "[&>button]:text-muted-foreground/40",
  disabled: "[&>button]:cursor-not-allowed [&>button]:text-muted-foreground/30 [&>button]:hover:bg-transparent"
}

export const DatePicker = ({ date, onChange, label, triggerLabel }: DatePickerProps) => (
  <Popover>
    <PopoverTrigger
      aria-label={label}
      className={cn(buttonVariants({ variant: "secondary" }), "text-base")}
    >
      <CalendarDays className="h-4 w-4" aria-hidden="true" />
      {triggerLabel}
    </PopoverTrigger>
    <PopoverContent align="center" className="w-auto">
      <DayPicker
        mode="single"
        required
        selected={parseIsoDate(date)}
        onSelect={(next) => onChange(toIsoDate(next))}
        classNames={dayPickerClassNames}
        components={{
          Chevron: ({ orientation }) =>
            orientation === "left" ? (
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )
        }}
      />
    </PopoverContent>
  </Popover>
)
