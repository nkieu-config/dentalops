import type { Appointment } from "@dentalops/contracts"
import * as Dialog from "@radix-ui/react-dialog"
import { Search } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { cn } from "../../lib/cn"
import { bkkDate, fmtDay, fmtTime } from "./lib/geometry"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  appointments: Appointment[]
  onSelect: (appointment: Appointment) => void
}

const MAX_RESULTS = 8

const matches = (appointment: Appointment, needle: string): boolean => {
  const haystack = `${appointment.patient.name} ${appointment.patient.phone} ${appointment.service.name}`
  return haystack.toLowerCase().includes(needle)
}

export const CommandPalette = ({ open, onOpenChange, appointments, onSelect }: CommandPaletteProps) => {
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery("")
    setActiveIndex(0)
  }, [open])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pool = needle ? appointments.filter((a) => matches(a, needle)) : appointments
    return [...pool]
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .slice(0, MAX_RESULTS)
  }, [appointments, query])

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
          className="fixed left-1/2 top-24 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-card border border-border bg-card text-card-foreground shadow-md focus:outline-none"
        >
          <Dialog.Title className="sr-only">Find a patient</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search this view's appointments by patient name or phone number.
          </Dialog.Description>
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
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
              placeholder="Search by patient name or phone…"
              className="min-h-9 flex-1 border-none bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-meta text-muted-foreground sm:inline">
              esc
            </kbd>
          </div>
          <ul role="listbox" aria-label="Matching appointments" className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {appointments.length === 0 ? "Nothing on this view yet" : "No matches on this view"}
              </li>
            ) : (
              results.map((appointment, index) => (
                <li key={appointment.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(appointment)}
                    className={cn(
                      "flex w-full min-h-11 items-center gap-3 rounded-md px-3 py-2 text-left text-sm",
                      index === activeIndex ? "bg-accent" : "hover:bg-accent"
                    )}
                  >
                    <span className="w-28 shrink-0 tabular-nums text-muted-foreground">
                      {fmtDay(bkkDate(Date.parse(appointment.startsAt)))} · {fmtTime(Date.parse(appointment.startsAt))}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{appointment.patient.name}</span>
                    <span className="shrink-0 truncate text-muted-foreground">{appointment.service.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
