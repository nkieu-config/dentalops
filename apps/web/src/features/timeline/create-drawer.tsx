import {
  appointmentSchema,
  appointmentSeriesSchema,
  patientDetailSchema,
  patientPageSchema,
  type SeriesConflict,
  type StaffMember
} from "@dentalops/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RefreshCw, Search, UserRound } from "lucide-react"
import { FormEvent, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "../../components/ui/button"
import { Checkbox } from "../../components/ui/checkbox"
import { Field, FieldInput, FormError } from "../../components/ui/form-field"
import { Input } from "../../components/ui/input"
import { AppSelect } from "../../components/ui/app-select"
import { Sheet } from "../../components/ui/sheet"
import { api, ApiError } from "../../lib/api"
import { cn } from "../../lib/cn"
import { useDiscardGuard } from "../../lib/use-discard-guard"
import { useServices } from "./hooks"
import { bkkDate, fmtDay, fmtTime } from "./lib/geometry"
import { SeriesConflictList, readSeriesConflicts } from "./series-dialog"
import { queryKeys } from "../../lib/query-keys"

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
  branchId: string
  dentist?: StaffMember
  startsAt?: number
}

interface ResolvedCreateDraft {
  branchId: string
  dentist: StaffMember
  startsAt: number
}

interface CreateDrawerProps {
  draft: CreateDraft | null
  dentists: StaffMember[]
  dayStart: number
  branchName?: string
  initialPatientId?: string
  onClose: () => void
}

const parseTimeOfDay = (dayStart: number, value: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, hh, mm] = match
  return dayStart + Number(hh) * 60 * MINUTE + Number(mm) * MINUTE
}

export const CreateDrawer = ({
  draft,
  dentists,
  dayStart,
  branchName,
  initialPatientId,
  onClose
}: CreateDrawerProps) => {
  const queryClient = useQueryClient()
  const services = useServices()
  const [serviceId, setServiceId] = useState("")
  const [patientId, setPatientId] = useState("")
  const [patientName, setPatientName] = useState("")
  const [patientPhone, setPatientPhone] = useState("")
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [repeats, setRepeats] = useState(false)
  const [interval, setInterval] = useState(1)
  const [count, setCount] = useState(DEFAULT_COUNT)
  const [weekdays, setWeekdays] = useState<number[] | null>(null)
  const [conflicts, setConflicts] = useState<SeriesConflict[]>([])
  const [dentistId, setDentistId] = useState(draft?.dentist?.id ?? "")
  const [timeValue, setTimeValue] = useState(draft?.startsAt ? fmtTime(draft.startsAt) : "")
  const [bookingError, setBookingError] = useState("")
  const repeatDetailsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  const resolvedDentist = dentists.find((d) => d.id === dentistId) ?? draft?.dentist ?? null
  const resolvedStartsAt = draft && timeValue ? parseTimeOfDay(dayStart, timeValue) : null
  const resolvedDraft: ResolvedCreateDraft | null =
    draft && resolvedDentist && resolvedStartsAt !== null
      ? { dentist: resolvedDentist, branchId: draft.branchId, startsAt: resolvedStartsAt }
      : null

  const byWeekday = weekdays ?? [bkkWeekday(dayStart)]

  const patients = useQuery({
    queryKey: queryKeys.patients.search(debouncedSearch),
    queryFn: () =>
      api("/patients", patientPageSchema, {
        query: { q: debouncedSearch || undefined, limit: debouncedSearch ? "8" : "5" }
      })
  })
  const initialPatient = useQuery({
    queryKey: queryKeys.patients.detail(initialPatientId),
    queryFn: () => api(`/patients/${initialPatientId}`, patientDetailSchema),
    enabled: Boolean(initialPatientId)
  })

  useEffect(() => {
    if (!initialPatient.data || patientId) return
    setPatientId(initialPatient.data.id)
    setPatientName(initialPatient.data.name)
    setPatientPhone(initialPatient.data.phone)
  }, [initialPatient.data, patientId])

  const selectedService = services.data?.find((service) => service.id === serviceId) ?? null
  const visiblePatients = debouncedSearch
    ? (patients.data?.items ?? []).slice(0, 8)
    : (patients.data?.items ?? []).slice(0, 5)
  const missingFields = [
    !resolvedDentist ? "dentist" : null,
    resolvedStartsAt === null ? "time" : null,
    !selectedService ? "service" : null,
    !patientId ? "patient" : null,
    repeats && byWeekday.length === 0 ? "weekday" : null
  ].filter((field): field is string => field !== null)
  const missingFieldLabel = (() => {
    if (missingFields.length === 0) return ""
    if (missingFields.length === 1) return missingFields[0]
    if (missingFields.length === 2) return `${missingFields[0]} and ${missingFields[1]}`
    return `${missingFields.slice(0, -1).join(", ")}, and ${missingFields.at(-1)}`
  })()
  const endTime =
    resolvedStartsAt !== null && selectedService
      ? fmtTime(resolvedStartsAt + selectedService.durationMin * MINUTE)
      : null
  const summaryParts = [
    selectedService?.name,
    resolvedDentist?.name,
    resolvedStartsAt !== null
      ? `${fmtDay(bkkDate(resolvedStartsAt))} · ${fmtTime(resolvedStartsAt)}${endTime ? `–${endTime}` : ""}`
      : null,
    repeats ? `weekly ×${count}` : null,
    patientName || null
  ].filter((part): part is string => Boolean(part))

  const done = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.root() })
    setConflicts([])
    setBookingError("")
    onClose()
  }

  const create = useMutation({
    mutationFn: (draftToBook: ResolvedCreateDraft) =>
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
      setBookingError(error instanceof ApiError ? error.message : "Booking failed")
    }
  })

  const createSeries = useMutation({
    mutationFn: (draftToBook: ResolvedCreateDraft) =>
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
  const dirty = Boolean(serviceId || patientId || repeats || interval !== 1 || count !== DEFAULT_COUNT || weekdays !== null || dentistId !== (draft?.dentist?.id ?? "") || timeValue !== (draft?.startsAt ? fmtTime(draft.startsAt) : ""))
  const discardGuard = useDiscardGuard(dirty, onClose)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!resolvedDraft || !serviceId || !patientId || pending) return
    setConflicts([])
    setBookingError("")
    if (repeats) createSeries.mutate(resolvedDraft)
    else create.mutate(resolvedDraft)
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
      onOpenChange={discardGuard.requestClose}
      title="New appointment"
      initialFocusId={!draft?.dentist ? "create-dentist" : !draft.startsAt ? "create-starts" : "create-service"}
      footer={
        <div className="space-y-3">
          {summaryParts.length > 0 ? (
            <div data-testid="create-summary" className="min-w-0">
              <p className="truncate type-ui font-semibold text-foreground">
                {summaryParts.join(" · ")}
              </p>
            </div>
          ) : null}
          {missingFields.length > 0 ? (
            <p id="create-missing-fields" data-testid="create-missing-fields" className="type-meta text-muted-foreground">
              Choose a {missingFieldLabel} to continue.
            </p>
          ) : null}
          <Button
            type="submit"
            form="create-appointment-form"
            className="w-full"
            disabled={!resolvedDraft || !serviceId || !patientId || pending || (repeats && byWeekday.length === 0)}
            aria-describedby={missingFields.length > 0 ? "create-missing-fields" : undefined}
          >
            {pending ? "Booking…" : repeats ? "Book series" : "Book appointment"}
          </Button>
        </div>
      }
    >
      {draft ? (
        <form id="create-appointment-form" className="space-y-6" onSubmit={submit} noValidate>
          <div
            data-testid="create-date-context"
            className="flex min-w-0 items-center justify-between gap-3 rounded-card border border-border bg-surface-subtle px-3 py-2.5"
          >
            <span className="min-w-0 truncate type-ui font-medium text-muted-foreground">
              {branchName ?? "Selected branch"}
            </span>
            <span className="type-ui font-semibold tabular-nums text-foreground">
              {fmtDay(bkkDate(dayStart))}
            </span>
          </div>
          <section aria-labelledby="create-when-heading" className="space-y-3">
            <div>
              <h3 id="create-when-heading" className="type-ui font-semibold text-foreground">When</h3>
              <p className="mt-0.5 type-meta text-muted-foreground">Choose the clinician and starting time.</p>
            </div>
            <div
              data-testid="create-primary-fields"
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 max-[359px]:grid-cols-1"
            >
              <Field id="create-dentist" label="Dentist">
                {(aria) => (
                  <AppSelect
                    {...aria}
                    name="dentistId"
                    value={dentistId}
                    aria-label="Dentist"
                    aria-required="true"
                    placeholder="Choose a dentist"
                    onValueChange={(value) => {
                      setDentistId(value)
                      setBookingError("")
                    }}
                    options={dentists.map((dentist) => ({ value: dentist.id, label: dentist.name }))}
                  />
                )}
              </Field>
              <Field id="create-starts" label="Starts">
                {(aria) => (
                  <FieldInput
                    {...aria}
                    name="startsAt"
                    type="time"
                    autoComplete="off"
                    className="tabular-nums"
                    value={timeValue}
                    onChange={(e) => {
                      setTimeValue(e.target.value)
                      setBookingError("")
                    }}
                  />
                )}
              </Field>
            </div>
            <FormError message={bookingError || null} />
          </section>
          <section className="space-y-3 border-t border-border pt-5">
            <div>
              <h3 id="create-service-heading" className="type-ui font-semibold text-foreground">Service</h3>
              <p className="mt-0.5 type-meta text-muted-foreground">Duration updates the appointment end time.</p>
            </div>
            <div className="space-y-1">
              <Field id="create-service" label="Treatment">
                {(aria) => (
                  <AppSelect
                    {...aria}
                    name="serviceId"
                    value={serviceId}
                    aria-label="Service"
                    aria-required="true"
                    placeholder={services.isPending ? "Loading services…" : "Choose a service"}
                    disabled={services.isPending || services.isError}
                    onValueChange={setServiceId}
                    options={(services.data ?? []).map((service) => ({ value: service.id, label: `${service.name} · ${service.durationMin} min` }))}
                  />
                )}
              </Field>
              {services.isError ? (
                <div className="flex min-h-11 items-center justify-between gap-3 rounded-control bg-destructive-soft px-3 type-meta text-destructive">
                  <span>Services could not be loaded.</span>
                  <button type="button" onClick={() => void services.refetch()} className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
                  </button>
                </div>
              ) : null}
            </div>
          </section>
          <section className="space-y-3 border-t border-border pt-5">
            <div>
              <h3 id="create-patient-heading" className="type-ui font-semibold text-foreground">Patient</h3>
              <p className="mt-0.5 type-meta text-muted-foreground">Find an existing patient by name or phone.</p>
            </div>
            {patientId ? (
              <div data-testid="selected-patient" className="flex min-w-0 items-center gap-3 rounded-card border border-border bg-secondary/60 p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-muted-foreground">
                  <UserRound className="h-4 w-4" aria-hidden="true" />
                </span>
                <button type="button" aria-pressed="true" className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="block truncate type-ui font-semibold">{patientName}</span>
                  <span className="mt-0.5 block truncate type-meta tabular-nums text-muted-foreground">{patientPhone}</span>
                </button>
                <Button type="button" variant="ghost" className="shrink-0" onClick={() => {
                  setPatientId("")
                  setPatientName("")
                  setPatientPhone("")
                }}>
                  Change patient
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="create-patient-search"
                    name="patientSearch"
                    autoComplete="off"
                    role="combobox"
                    aria-controls="create-patient-results"
                    aria-expanded="true"
                    aria-autocomplete="list"
                    aria-label="Patient"
                    placeholder="Search by name or phone…"
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {patients.isPending ? (
                  <div data-testid="patient-results-loading" className="space-y-1 rounded-card border border-border p-1" aria-label="Loading patients">
                    {[0, 1, 2].map((row) => <div key={row} className="h-12 animate-pulse rounded-control bg-surface-subtle" />)}
                  </div>
                ) : patients.isError ? (
                  <div className="flex min-h-14 items-center justify-between gap-3 rounded-card border border-border px-3 type-meta text-muted-foreground">
                    <span>Patients could not be loaded.</span>
                    <Button type="button" variant="ghost" onClick={() => void patients.refetch()}>Retry</Button>
                  </div>
                ) : visiblePatients.length === 0 ? (
                  <div className="rounded-card border border-dashed border-border px-3 py-5 text-center type-ui text-muted-foreground">
                    {debouncedSearch ? `No patients match “${debouncedSearch}”` : "No patients yet"}
                  </div>
                ) : (
                  <div id="create-patient-results" role="listbox" aria-label="Patient results" className="space-y-1 rounded-card border border-border bg-card p-1">
                    {visiblePatients.map((p) => (
                      <div
                        key={p.id}
                        role="option"
                        aria-selected="false"
                        onClick={() => {
                          setPatientId(p.id)
                          setPatientName(p.name)
                          setPatientPhone(p.phone)
                        }}
                      >
                        <button
                          type="button"
                          aria-pressed="false"
                          className="flex min-h-11 w-full flex-col items-start rounded-control px-2.5 py-1.5 text-left type-ui hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="font-medium">{p.name}</span>
                          <span className="mt-0.5 type-meta tabular-nums text-muted-foreground">{p.phone}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
          <section aria-label="Repeat" className="space-y-3 border-t border-border pt-5">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 type-ui" htmlFor="create-repeats">
              <Checkbox
                id="create-repeats"
                className="mt-0.5"
                checked={repeats}
                aria-label="Repeat weekly"
                onChange={(e) => {
                  setRepeats(e.target.checked)
                  if (e.target.checked) window.setTimeout(() => repeatDetailsRef.current?.scrollIntoView({ block: "nearest" }), 0)
                }}
              />
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">Repeat</span>
                <span className="mt-0.5 block type-meta text-muted-foreground">Create a weekly appointment series.</span>
              </span>
            </label>
            {repeats ? (
              <div ref={repeatDetailsRef} className="space-y-3 rounded-card bg-surface-subtle p-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field id="create-interval" label="Every">
                    {(aria) => (
                      <FieldInput
                        {...aria}
                        name="recurrenceInterval"
                        type="number"
                        inputMode="numeric"
                        autoComplete="off"
                        min={MIN_INTERVAL}
                        max={MAX_INTERVAL}
                        className="tabular-nums"
                        value={interval}
                        onChange={(e) =>
                          setInterval(clampNumber(e.target.valueAsNumber, MIN_INTERVAL, MAX_INTERVAL))
                        }
                      />
                    )}
                  </Field>
                  <Field id="create-count" label="Occurrences">
                    {(aria) => (
                      <FieldInput
                        {...aria}
                        name="recurrenceCount"
                        type="number"
                        inputMode="numeric"
                        autoComplete="off"
                        min={MIN_COUNT}
                        max={MAX_COUNT}
                        className="tabular-nums"
                        value={count}
                        onChange={(e) =>
                          setCount(clampNumber(e.target.valueAsNumber, MIN_COUNT, MAX_COUNT))
                        }
                      />
                    )}
                  </Field>
                </div>
                <fieldset>
                  <legend className="mb-1 type-ui font-medium">On</legend>
                  <div data-testid="weekday-grid" className="grid grid-cols-7 gap-1">
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        aria-pressed={byWeekday.includes(day.value)}
                        onClick={() => toggleWeekday(day.value)}
                        className={cn(
                          "min-h-11 min-w-0 rounded-control border border-border px-1 type-meta font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
        </form>
      ) : null}
      {discardGuard.dialog}
    </Sheet>
  )
}
