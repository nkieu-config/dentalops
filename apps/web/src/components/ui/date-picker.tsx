import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"
import { cn } from "../../lib/cn"
import { buttonVariants } from "./button"
import { focusRing } from "./focus-ring"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

interface DatePickerProps {
  date: string
  onChange: (isoDate: string) => void
  label: string
  triggerLabel: string
  compactTriggerLabel?: string
  className?: string
  fromDate?: string
  disabled?: boolean
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
  month_caption: "flex items-center justify-center h-11 type-ui font-semibold mb-1",
  nav: "absolute inset-x-0 top-0 flex h-11 items-center justify-between px-1",
  button_previous: `flex h-11 w-11 cursor-pointer items-center justify-center rounded-control hover:bg-accent max-[359px]:h-10 max-[359px]:w-10 ${focusRing}`,
  button_next: `flex h-11 w-11 cursor-pointer items-center justify-center rounded-control hover:bg-accent max-[359px]:h-10 max-[359px]:w-10 ${focusRing}`,
  month_grid: "border-collapse",
  weekdays: "flex",
  weekday: "h-11 w-11 type-meta font-semibold uppercase tracking-wide text-muted-foreground max-[359px]:h-10 max-[359px]:w-10",
  week: "flex",
  day: "p-0 text-center",
  day_button: `h-11 w-11 cursor-pointer rounded-full type-ui font-medium hover:bg-accent max-[359px]:h-10 max-[359px]:w-10 ${focusRing}`,
  selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
  today: "[&>button]:font-bold [&>button]:text-primary",
  outside: "[&>button]:text-muted-foreground",
  disabled: "[&>button]:cursor-not-allowed [&>button]:text-muted-foreground [&>button]:opacity-50 [&>button]:hover:bg-transparent"
}

export const DatePicker = ({
  date,
  onChange,
  label,
  triggerLabel,
  compactTriggerLabel,
  className,
  fromDate,
  disabled = false
}: DatePickerProps) => (
  <Popover>
    <PopoverTrigger
      aria-label={label}
      disabled={disabled}
      className={cn(buttonVariants({ variant: "secondary" }), "shrink-0 whitespace-nowrap", className)}
    >
      <CalendarDays className="h-4 w-4" aria-hidden="true" />
      <span className={compactTriggerLabel ? "max-sm:hidden" : undefined}>{triggerLabel}</span>
      {compactTriggerLabel ? <span className="hidden max-sm:inline">{compactTriggerLabel}</span> : null}
    </PopoverTrigger>
    <PopoverContent align="center" className="w-auto">
      <DayPicker
        mode="single"
        required
        selected={parseIsoDate(date)}
        disabled={fromDate ? { before: parseIsoDate(fromDate) } : undefined}
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
