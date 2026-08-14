import type { Appointment, Resource, StaffMember } from "@dentalops/contracts"
import * as Dialog from "@radix-ui/react-dialog"
import { Search, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { cn } from "../../lib/cn"
import { AppointmentStatusMark } from "./appointment-status-mark"
import { bkkDate, fmtCompactDay, fmtTime, fmtWeekdayShort } from "./lib/geometry"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  appointments: Appointment[]
  dentists?: StaffMember[]
  chairs?: Resource[]
  scope?: "day" | "week"
  scopeLabel?: string
  onSelect: (appointment: Appointment) => void
  onShowShortcuts?: () => void
}

const MAX_RESULTS = 8

type NameById = ReadonlyMap<string, string>

const contextFor = (appointment: Appointment, dentists: NameById, chairs: NameById): string => {
  const dentist = dentists.get(appointment.dentistId)
  const chairId = appointment.claims.find((claim) => claim.status === "active")?.resourceId
  const chair = chairId === undefined ? undefined : chairs.get(chairId)
  return [dentist, chair].filter(Boolean).join(" · ")
}

const matches = (
  appointment: Appointment,
  needle: string,
  dentists: NameById,
  chairs: NameById
): boolean => {
  const haystack = `${appointment.patient.name} ${appointment.patient.phone} ${appointment.service.name} ${contextFor(appointment, dentists, chairs)}`
  return haystack.toLowerCase().includes(needle)
}

const NO_DENTISTS: StaffMember[] = []
const NO_CHAIRS: Resource[] = []

const nameById = (rows: ReadonlyArray<{ id: string; name: string }>): NameById =>
  new Map(rows.map((row) => [row.id, row.name]))

export const CommandPalette = ({
  open,
  onOpenChange,
  appointments,
  dentists = NO_DENTISTS,
  chairs = NO_CHAIRS,
  scope = "day",
  scopeLabel,
  onSelect,
  onShowShortcuts
}: CommandPaletteProps) => {
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setActiveIndex(0)
  }, [open])

  const dentistNames = useMemo(() => nameById(dentists), [dentists])
  const chairNames = useMemo(() => nameById(chairs), [chairs])

  const chronological = useMemo(
    () => [...appointments].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [appointments]
  )

  const matchingAppointments = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return chronological
    return chronological.filter((a) => matches(a, needle, dentistNames, chairNames))
  }, [chronological, query, dentistNames, chairNames])
  const results = matchingAppointments.slice(0, MAX_RESULTS)
  const activeOptionId = results[activeIndex] ? `schedule-search-option-${results[activeIndex].id}` : undefined
  const resultStatus =
    results.length === 0
      ? query.trim()
        ? `No appointments match “${query.trim()}”`
        : "Nothing on this view yet"
      : matchingAppointments.length > MAX_RESULTS
        ? `Showing ${results.length} of ${matchingAppointments.length} appointments`
        : `${results.length} ${results.length === 1 ? "appointment" : "appointments"}`

  const choose = (appointment: Appointment | undefined) => {
    if (!appointment) return
    onSelect(appointment)
    onOpenChange(false)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      choose(results[activeIndex])
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
          className="fixed left-1/2 top-4 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] overflow-hidden rounded-card border border-border bg-card text-card-foreground shadow-md focus:outline-none sm:top-20 sm:max-h-[calc(100dvh-10rem)]"
        >
          <div className="flex min-w-0 items-start justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
            <div className="min-w-0">
              <Dialog.Title className="type-dialog-title font-semibold">Search this schedule</Dialog.Title>
              <Dialog.Description className="mt-1 truncate type-supporting text-muted-foreground">
                {scopeLabel ?? `${appointments.length} appointments on this view`}
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close search"
              className="-mr-2 -mt-2 grid min-h-11 min-w-11 shrink-0 place-items-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Dialog.Close>
          </div>
          <div className="mx-3 flex min-w-0 items-center gap-2 rounded-control border border-border bg-surface-subtle px-3 shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 sm:mx-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActiveIndex(0)
              }}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-autocomplete="list"
              aria-controls="schedule-search-results"
              aria-expanded={open}
              aria-activedescendant={activeOptionId}
              aria-label="Search this schedule"
              placeholder="Search by name, phone, dentist, or chair…"
              className="min-h-11 min-w-0 flex-1 border-none bg-transparent px-0 type-body outline-none placeholder:text-muted-foreground"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("")
                  setActiveIndex(0)
                  inputRef.current?.focus()
                }}
                className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-control text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <kbd className="hidden shrink-0 rounded-control border border-border bg-card px-1.5 py-0.5 font-mono type-meta text-muted-foreground sm:inline">
                Esc
              </kbd>
            )}
          </div>
          <p role="status" aria-live="polite" className="px-4 pb-1 pt-3 type-meta text-muted-foreground sm:px-5">
            {resultStatus}
          </p>
          <ul id="schedule-search-results" role="listbox" aria-label="Matching appointments" className="min-h-0 overscroll-contain overflow-y-auto px-2 pb-2">
            {results.length === 0 ? (
              <li className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border px-4 py-6 text-center">
                <span className="type-ui text-muted-foreground">
                  {appointments.length === 0
                    ? "Appointments will appear here when this schedule has bookings."
                    : "Try a patient, phone number, dentist, or chair."}
                </span>
                {query ? (
                  <button
                    type="button"
                    aria-label="Show all appointments"
                    onClick={() => {
                      setQuery("")
                      setActiveIndex(0)
                      inputRef.current?.focus()
                    }}
                    className="min-h-11 rounded-control px-3 type-ui font-medium text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Clear search
                  </button>
                ) : null}
              </li>
            ) : (
              <>
                {results.map((appointment, index) => {
                  const context = contextFor(appointment, dentistNames, chairNames)
                  const startsAt = Date.parse(appointment.startsAt)
                  const phoneMatched = query.trim() && appointment.patient.phone.toLowerCase().includes(query.trim().toLowerCase())
                  return (
                    <li key={appointment.id}>
                      <button
                        type="button"
                        id={`schedule-search-option-${appointment.id}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => choose(appointment)}
                        className={cn(
                          "relative flex w-full min-h-14 items-center gap-3 rounded-control px-3 py-2 text-left type-ui transition-colors after:absolute after:bottom-2 after:left-0 after:top-2 after:w-0.5 after:rounded-full after:bg-primary after:opacity-0",
                          index === activeIndex
                            ? "bg-accent after:opacity-100"
                            : "hover:bg-accent/70"
                        )}
                      >
                        <span className={cn("shrink-0 whitespace-nowrap tabular-nums text-muted-foreground", scope === "week" ? "w-32" : "w-12")}>
                          {scope === "week" ? `${fmtWeekdayShort(bkkDate(startsAt))} ${fmtCompactDay(bkkDate(startsAt))} · ` : null}
                          {fmtTime(startsAt)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{appointment.patient.name}</span>
                          <span className="truncate type-meta text-muted-foreground">
                            <span className={cn(appointment.status === "cancelled" && "line-through")}>
                              {appointment.service.name}
                            </span>
                            {context ? ` · ${context}` : null}
                          </span>
                          {phoneMatched ? (
                            <span className="truncate type-meta tabular-nums text-muted-foreground">
                              {appointment.patient.phone}
                            </span>
                          ) : null}
                        </span>
                        <AppointmentStatusMark
                          className="shrink-0"
                          status={appointment.status}
                          recurring={Boolean(appointment.seriesId)}
                          showLabel
                        />
                      </button>
                    </li>
                  )
                })}
              </>
            )}
          </ul>
          {onShowShortcuts ? (
            <div className="flex justify-end border-t border-border px-2 py-1 sm:px-3">
              <button
                type="button"
                data-testid="palette-shortcuts"
                onClick={() => {
                  onOpenChange(false)
                  onShowShortcuts()
                }}
                className="flex min-h-11 items-center gap-2 rounded-control px-2 type-meta text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <kbd className="rounded-control border border-border bg-card px-1.5 py-0.5 font-mono">?</kbd>
                Keyboard shortcuts
              </button>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
