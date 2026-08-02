import {
  appointmentSchema,
  appointmentSeriesSchema,
  patientPageSchema,
  type SeriesConflict,
  type StaffMember
} from "@dentalops/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useState } from "react"
import { toast } from "sonner"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { NativeSelect } from "../../components/ui/native-select"
import { Sheet } from "../../components/ui/sheet"
import { api, ApiError } from "../../lib/api"
import { cn } from "../../lib/cn"
import { useServices } from "./hooks"
import { fmtTime } from "./lib/geometry"
import { SeriesConflictList, readSeriesConflicts } from "./series-dialog"

const MINUTE = 60_000
const BANGKOK_OFFSET_MIN = 420
const MIN_COUNT = 2
const MAX_COUNT = 52
const MIN_INTERVAL = 1
const MAX_INTERVAL = 12
const DEFAULT_COUNT = 4

const WEEKDAYS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" }
]

const bkkWeekday = (ms: number): number =>
  new Date(ms + BANGKOK_OFFSET_MIN * MINUTE).getUTCDay()

const clampNumber = (value: number, min: number, max: number): number =>
  Number.isNaN(value) ? min : Math.min(Math.max(value, min), max)

export interface CreateDraft {
  dentist: StaffMember
  branchId: string
  startsAt: number
}

interface CreateDrawerProps {
  draft: CreateDraft | null
  onClose: () => void
}

export const CreateDrawer = ({ draft, onClose }: CreateDrawerProps) => {
  const queryClient = useQueryClient()
  const services = useServices()
  const [serviceId, setServiceId] = useState("")
  const [patientId, setPatientId] = useState("")
  const [search, setSearch] = useState("")
  const [repeats, setRepeats] = useState(false)
  const [interval, setInterval] = useState(1)
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [weekdays, setWeekdays] = useState<number[] | null>(null)
  const [conflicts, setConflicts] = useState<SeriesConflict[]>([])

  const byWeekday = weekdays ?? (draft ? [bkkWeekday(draft.startsAt)] : [])

  const patients = useQuery({
    queryKey: ["patients", search],
    queryFn: () =>
      api("/patients", patientPageSchema, { query: { q: search || undefined, limit: "20" } })
  })

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ["appointments"] })
    setConflicts([])
    onClose()
  }

  const create = useMutation({
    mutationFn: (draftToBook: CreateDraft) =>
      api("/appointments", appointmentSchema, {
        method: "POST",
        body: {
          serviceId,
          dentistId: draftToBook.dentist.id,
          patientId,
          branchId: draftToBook.branchId,
          startsAt: new Date(draftToBook.startsAt).toISOString()
        }
      }),
    onSuccess: () => {
      toast.success("Appointment booked")
      done()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Booking failed")
    }
  })

  const createSeries = useMutation({
    mutationFn: (draftToBook: CreateDraft) =>
      api("/appointments/series", appointmentSeriesSchema, {
        method: "POST",
        body: {
          serviceId,
          dentistId: draftToBook.dentist.id,
          patientId,
          branchId: draftToBook.branchId,
          startsAt: new Date(draftToBook.startsAt).toISOString(),
          freq: "weekly",
          interval,
          byWeekday,
          count
        }
      }),
    onSuccess: (series) => {
      toast.success(`Booked ${series.appointments.length} appointments`)
      done()
    },
    onError: (error) => {
      const found = readSeriesConflicts(error)
      setConflicts(found)
      if (found.length > 0) return
      toast.error(error instanceof ApiError ? error.message : "Booking failed")
    }
  })

  const pending = create.isPending || createSeries.isPending

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft || !serviceId || !patientId || pending) return
    setConflicts([])
    if (repeats) createSeries.mutate(draft)
    else create.mutate(draft)
  }

  const toggleWeekday = (value: number) => {
    const next = byWeekday.includes(value)
      ? byWeekday.filter((day) => day !== value)
      : [...byWeekday, value].sort((a, b) => a - b)
    setWeekdays(next)
  }

  return (
    <Sheet
      open={draft !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="New appointment"
    >
      {draft ? (
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-1">
            <Label>Dentist</Label>
            <p className="text-sm">{draft.dentist.name}</p>
          </div>
          <div className="space-y-1">
            <Label>Starts</Label>
            <p className="text-sm tabular-nums">{fmtTime(draft.startsAt)}</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-service">Service</Label>
            <NativeSelect
              id="create-service"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              <option value="">Choose a service</option>
              {(services.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMin} min
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor="create-patient-search">Patient</Label>
            <Input
              id="create-patient-search"
              placeholder="Search by name or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-1">
              {(patients.data?.items ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.id === patientId}
                  onClick={() => setPatientId(p.id)}
                  className={
                    p.id === patientId
                      ? "w-full rounded-sm bg-secondary px-2 py-1.5 text-left text-sm text-primary"
                      : "w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                  }
                >
                  {p.name} <span className="text-muted-foreground tabular-nums">{p.phone}</span>
                </button>
              ))}
            </div>
          </div>
          <section aria-label="Repeat" className="space-y-3 border-t border-border pt-4">
            <label className="flex min-h-11 items-center gap-2 text-sm" htmlFor="create-repeats">
              <input
                id="create-repeats"
                type="checkbox"
                className="h-4 w-4"
                checked={repeats}
                onChange={(e) => setRepeats(e.target.checked)}
              />
              Repeat weekly
            </label>
            {repeats ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="create-interval">Every</Label>
                    <Input
                      id="create-interval"
                      type="number"
                      min={MIN_INTERVAL}
                      max={MAX_INTERVAL}
                      className="min-h-11 w-24 tabular-nums"
                      value={interval}
                      onChange={(e) =>
                        setInterval(clampNumber(e.target.valueAsNumber, MIN_INTERVAL, MAX_INTERVAL))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="create-count">Occurrences</Label>
                    <Input
                      id="create-count"
                      type="number"
                      min={MIN_COUNT}
                      max={MAX_COUNT}
                      className="min-h-11 w-24 tabular-nums"
                      value={count}
                      onChange={(e) =>
                        setCount(clampNumber(e.target.valueAsNumber, MIN_COUNT, MAX_COUNT))
                      }
                    />
                  </div>
                </div>
                <fieldset>
                  <legend className="mb-1 text-sm font-medium">On</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        aria-pressed={byWeekday.includes(day.value)}
                        onClick={() => toggleWeekday(day.value)}
                        className={cn(
                          "min-h-11 min-w-11 rounded-md border border-border px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          byWeekday.includes(day.value)
                            ? "bg-secondary text-secondary-foreground"
                            : "hover:bg-accent"
                        )}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            ) : null}
          </section>
          <SeriesConflictList conflicts={conflicts} />
          <Button
            type="submit"
            className="w-full"
            disabled={!serviceId || !patientId || pending || (repeats && byWeekday.length === 0)}
          >
            {repeats ? "Book series" : "Book appointment"}
          </Button>
        </form>
      ) : null}
    </Sheet>
  )
}
