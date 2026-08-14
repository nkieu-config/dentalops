import { auditPageSchema, type AuditEntry } from "@dentalops/contracts"
import { useInfiniteQuery } from "@tanstack/react-query"
import { ChevronRight, History, ListFilter, SearchX, TriangleAlert } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, Navigate, useSearchParams } from "react-router"
import { AppSelect } from "../../components/ui/app-select"
import { Button } from "../../components/ui/button"
import { PageTitle } from "../../components/ui/page-header"
import { EmptyState } from "../../components/ui/empty-state"
import { InitialsAvatar } from "../../components/ui/initials-avatar"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover"
import { Sheet } from "../../components/ui/sheet"
import { Skeleton } from "../../components/ui/skeleton"
import { StatusCallout } from "../../components/ui/status-callout"
import { api } from "../../lib/api"
import { appointmentStatus, readAppointmentStatus } from "../../lib/appointment-status"
import { useCanViewActivity } from "../../lib/session"
import { useServices, useStaff } from "../timeline/hooks"
import { DAY_MS, bkkDate, bkkDayStart, bkkShiftDate, bkkToday, fmtDay, fmtTime } from "../timeline/lib/geometry"
import { queryKeys } from "../../lib/query-keys"

const PAGE_SIZE = 25

const ACTION_WORDS: Record<string, string> = {
  "POST /appointments": "booked an appointment",
  "POST /appointments/series": "created a repeating appointment",
  "PATCH /appointments/:id": "moved an appointment",
  "PATCH /series/:id": "edited a repeating appointment",
  "POST /shifts": "added a shift",
  "POST /shifts/series": "created a repeating shift",
  "PATCH /shifts/:id": "moved a shift",
  "DELETE /shifts/:id": "removed a shift",
  "PATCH /shift-series/:id": "edited a repeating shift",
  "DELETE /shift-series/:id": "removed a repeating shift",
  "POST /time-blocks": "blocked out time",
  "DELETE /time-blocks/:id": "released blocked-out time",
  "POST /patients": "added a patient",
  "POST /roster/validate": "checked the roster",
  "POST /public/:clinicSlug/holds": "held a slot",
  "DELETE /public/:clinicSlug/holds/:holdId": "let a held slot go",
  "POST /public/:clinicSlug/appointments": "booked online",
  "POST /public/manage/:token/cancel": "cancelled their own booking"
}

const STATUS_ACTIONS = new Set(["appointment.status", "PATCH /appointments/:id/status"])

const VERB_WORDS: Record<string, string> = {
  POST: "created",
  PATCH: "updated",
  DELETE: "removed"
}

const ENTITY_NOUNS: Record<string, string> = {
  appointment: "appointment",
  appointments: "appointment",
  series: "repeating appointment",
  shifts: "shift",
  "shift-series": "repeating shift",
  "time-blocks": "time block",
  patients: "patient",
  public: "booking",
  unknown: "record"
}

const nounFor = (type: string): string =>
  ENTITY_NOUNS[type] ?? (type.endsWith("s") ? type.slice(0, -1) : type).replaceAll("-", " ")

const articleFor = (noun: string): string => (/^[aeiou]/i.test(noun) ? "an" : "a")

const statusOf = (value: unknown): string | undefined => {
  const status = (value as { status?: unknown } | null | undefined)?.status
  return typeof status === "string" ? status : undefined
}

export const describeAction = (entry: AuditEntry): string => {
  if (STATUS_ACTIONS.has(entry.action)) {
    const status = readAppointmentStatus(statusOf(entry.after))
    return status
      ? appointmentStatus[status].activityPhrase
      : "changed an appointment's status"
  }
  const known = ACTION_WORDS[entry.action]
  if (known) return known
  const noun = nounFor(entry.entity.type)
  const verb = VERB_WORDS[entry.action.split(" ")[0] ?? ""] ?? "changed"
  return `${verb} ${articleFor(noun)} ${noun}`
}

const entryKey = (entry: AuditEntry): string =>
  [entry.at.toISOString(), entry.requestId, entry.action, entry.entity.id].join("|")

interface EntryLink {
  href: string
  label: string
}

const readField = (payload: unknown, field: string): string | undefined => {
  const value = (payload as Record<string, unknown> | null | undefined)?.[field]
  return typeof value === "string" ? value : undefined
}

const readNestedName = (payload: unknown, field: string): string | undefined => {
  const nested = (payload as Record<string, unknown> | null | undefined)?.[field]
  const name = (nested as { name?: unknown } | null | undefined)?.name
  return typeof name === "string" ? name : undefined
}

const contextFor = (
  entry: AuditEntry,
  staffById: Map<string, string>,
  servicesById: Map<string, string>
): string | undefined => {
  const payload = entry.after ?? entry.before
  const startsAt = readField(payload, "startsAt")
  const staffId = readField(payload, "dentistId") ?? readField(payload, "staffId")
  const serviceId = readField(payload, "serviceId")
  const parts = [
    readNestedName(payload, "service") ?? (serviceId ? servicesById.get(serviceId) : undefined),
    staffId ? staffById.get(staffId) : undefined,
    startsAt
      ? `${fmtDay(bkkDate(Date.parse(startsAt)))} · ${fmtTime(Date.parse(startsAt))}`
      : undefined
  ].filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join(" · ") : undefined
}

const APPOINTMENT_ENTITY_TYPES = new Set(["appointments", "appointment", "series", "public"])
const SHIFT_ENTITY_TYPES = new Set(["shifts", "shift-series", "time-blocks"])

export const linkFor = (entry: AuditEntry): EntryLink | null => {
  if (entry.entity.type === "patients" && entry.entity.id) {
    return { href: `/app/patients/${entry.entity.id}`, label: "View patient" }
  }
  const payload = entry.after ?? entry.before
  const startsAt = readField(payload, "startsAt")
  const branchId = readField(payload, "branchId")
  if (!startsAt || !branchId) return null
  const date = bkkDate(Date.parse(startsAt))
  if (APPOINTMENT_ENTITY_TYPES.has(entry.entity.type)) {
    const appointmentParam = entry.entity.type === "series" ? "" : `&a=${entry.entity.id}`
    return {
      href: `/app/timeline?d=${date}&b=${branchId}${appointmentParam}`,
      label: "View on the timeline"
    }
  }
  if (SHIFT_ENTITY_TYPES.has(entry.entity.type)) {
    return { href: `/app/roster?w=${date}&b=${branchId}`, label: "View in the roster" }
  }
  return null
}

type NonEmptyArray<T> = [T, ...T[]]

interface ActivityCluster {
  entries: NonEmptyArray<AuditEntry>
}

const clusterKey = (entry: AuditEntry): string =>
  [entry.actor.type, entry.actor.id, entry.action, entry.entity.type, entry.entity.id].join("|")

export const groupConsecutiveActivity = (entries: AuditEntry[]): ActivityCluster[] =>
  entries.reduce<ActivityCluster[]>((clusters, entry) => {
    const previous = clusters.at(-1)
    if (previous && clusterKey(previous.entries[0]) === clusterKey(entry)) {
      previous.entries.push(entry)
      return clusters
    }
    clusters.push({ entries: [entry] })
    return clusters
  }, [])

interface ActivityRowProps {
  cluster: ActivityCluster
  staffById: Map<string, string>
  servicesById: Map<string, string>
}

const ActivityRow = ({ cluster, staffById, servicesById }: ActivityRowProps) => {
  const [entry, ...olderEntries] = cluster.entries
  const count = cluster.entries.length
  const isGrouped = count > 1
  const eventWord = describeAction(entry) === "checked the roster" ? "checks" : "events"
  const at = entry.at.getTime()
  const link = linkFor(entry)
  const context = contextFor(entry, staffById, servicesById)

  const body = (
    <>
      <InitialsAvatar name={entry.actor.name} />
      <div className="min-w-0">
        <p className="min-w-0 type-ui">
          <span className="font-medium text-foreground">{entry.actor.name}</span>{" "}
          <span className="text-muted-foreground">{describeAction(entry)}</span>
        </p>
        {context ? <p className="mt-0.5 truncate type-meta text-muted-foreground">{context}</p> : null}
      </div>
      <time
        dateTime={entry.at.toISOString()}
        className="shrink-0 text-right type-meta font-medium tabular-nums text-muted-foreground"
      >
        {fmtTime(at)}
      </time>
    </>
  )

  if (isGrouped) {
    return (
      <li className="border-b border-border last:border-b-0">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 pb-1 pt-3">{body}</div>
        <details className="px-4 pb-3 pl-16">
          <summary className="min-h-11 cursor-pointer content-center type-meta font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {count} {eventWord}
          </summary>
          <div className="space-y-1 pb-1 type-meta tabular-nums text-muted-foreground">
            {olderEntries.map((olderEntry) => (
  <div key={entryKey(olderEntry)}>
    <time dateTime={olderEntry.at.toISOString()}>{fmtTime(olderEntry.at.getTime())}</time>
  </div>
            ))}
          </div>
          {link ? <Link to={link.href} className="mt-2 inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:underline">{link.label}<ChevronRight className="size-4" aria-hidden="true" /></Link> : null}
        </details>
      </li>
    )
  }

  if (!link) {
    return <li className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border px-4 py-3 last:border-b-0">{body}</li>
  }

  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to={link.href}
        className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 px-4 py-3 transition-[background-color] duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {body}
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  )
}

interface Category {
  value: string
  label: string
  entityTypes?: string[]
}

const CATEGORIES: Category[] = [
  { value: "all", label: "All activity" },
  { value: "appointments", label: "Appointments", entityTypes: ["appointments", "appointment", "series"] },
  { value: "shifts", label: "Roster & shifts", entityTypes: ["shifts", "shift-series", "time-blocks"] },
  { value: "patients", label: "Patients", entityTypes: ["patients"] },
  { value: "public", label: "Public bookings", entityTypes: ["public"] },
  {
    value: "settings",
    label: "Clinic settings",
    entityTypes: ["branches", "services", "resources", "staff"]
  }
]

const GUESTS = "guests"
const ALL = "all"

const useDesktopFilters = (): boolean => {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches
  )

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)")
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return isDesktop
}

interface ActivityFiltersProps {
  category: string
  actor: string
  fromDate: string
  toDate: string
  staffPending: boolean
  actorOptions: { value: string; label: string }[]
  onFilterChange: (key: string, value: string) => void
}

const ActivityFilters = ({
  category,
  actor,
  fromDate,
  toDate,
  staffPending,
  actorOptions,
  onFilterChange
}: ActivityFiltersProps) => (
  <div role="group" aria-label="Filter activity" className="grid gap-3 sm:grid-cols-2">
    <div className="space-y-1.5">
      <Label htmlFor="activity-type">Type</Label>
      <AppSelect
        id="activity-type"
        aria-label="Activity type"
        value={category}
        onValueChange={(value) => onFilterChange("type", value)}
        options={CATEGORIES.map(({ value, label }) => ({ value, label }))}
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="activity-actor">By</Label>
      <AppSelect
        id="activity-actor"
        aria-label="Actor"
        value={actor}
        disabled={staffPending}
        onValueChange={(value) => onFilterChange("actor", value)}
        options={actorOptions}
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="activity-from">From date</Label>
      <Input
        id="activity-from"
        name="activity-from"
        type="date"
        max={toDate || undefined}
        value={fromDate}
        onChange={(event) => onFilterChange("from", event.target.value)}
      />
    </div>
    <div className="space-y-1.5">
      <Label htmlFor="activity-to">To date</Label>
      <Input
        id="activity-to"
        name="activity-to"
        type="date"
        min={fromDate || undefined}
        value={toDate}
        onChange={(event) => onFilterChange("to", event.target.value)}
      />
    </div>
  </div>
)

const activityFilterSummary = (
  category: string,
  actor: string,
  fromDate: string,
  toDate: string,
  actorOptions: { value: string; label: string }[]
): string[] => {
  const categoryLabel = CATEGORIES.find((item) => item.value === category)?.label
  const actorLabel = actorOptions.find((item) => item.value === actor)?.label
  const dateLabel = (value: string) => value ? fmtDay(value) : ""
  return [
    ...(category !== ALL && categoryLabel ? [categoryLabel] : []),
    ...(actor !== ALL && actorLabel ? [actorLabel] : []),
    ...(fromDate || toDate
      ? [fromDate && toDate ? `${dateLabel(fromDate)} to ${dateLabel(toDate)}` : dateLabel(fromDate || toDate)]
      : [])
  ]
}

interface FilterValues {
  category: string
  actor: string
  fromDate: string
  toDate: string
}

const validDate = (value: string | null): string =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""

export const ActivityPage = () => {
  const [params, setParams] = useSearchParams()
  const requestedCategory = params.get("type") ?? ALL
  const category = CATEGORIES.some((item) => item.value === requestedCategory) ? requestedCategory : ALL
  const actor = params.get("actor") ?? ALL
  const fromDate = validDate(params.get("from"))
  const toDate = validDate(params.get("to"))
  const staff = useStaff()
  const services = useServices()
  const staffById = useMemo(() => new Map((staff.data ?? []).map((member) => [member.id, member.name])), [staff.data])
  const servicesById = useMemo(() => new Map((services.data ?? []).map((service) => [service.id, service.name])), [services.data])
  const isDesktop = useDesktopFilters()
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFilters, setDraftFilters] = useState<FilterValues>({ category, actor, fromDate, toDate })

  const openFilters = () => {
    setDraftFilters({ category, actor, fromDate, toDate })
    setFilterOpen(true)
  }

  const onFilterOpenChange = (open: boolean) => {
    if (open) setDraftFilters({ category, actor, fromDate, toDate })
    setFilterOpen(open)
  }

  const setDraftFilter = (key: string, value: string) => {
    const property = key === "type" ? "category" : key === "actor" ? "actor" : key === "from" ? "fromDate" : "toDate"
    setDraftFilters((current) => ({ ...current, [property]: value }))
  }

  const applyFilters = () => {
    const next = new URLSearchParams()
    if (draftFilters.category !== ALL) next.set("type", draftFilters.category)
    if (draftFilters.actor !== ALL) next.set("actor", draftFilters.actor)
    if (draftFilters.fromDate) next.set("from", draftFilters.fromDate)
    if (draftFilters.toDate) next.set("to", draftFilters.toDate)
    setParams(next, { replace: true })
    setFilterOpen(false)
  }

  const hasActiveFilters = category !== ALL || actor !== ALL || fromDate !== "" || toDate !== ""
  const clearFilters = () => setParams({}, { replace: true })
  const clearDraftFilters = () => setDraftFilters({ category: ALL, actor: ALL, fromDate: "", toDate: "" })

  const entityTypes = CATEGORIES.find((c) => c.value === category)?.entityTypes
  const actorId = actor !== ALL && actor !== GUESTS ? actor : undefined
  const actorType = actor === GUESTS ? "public" : undefined
  const fromIso = fromDate ? new Date(bkkDayStart(fromDate)).toISOString() : undefined
  const toIso = toDate ? new Date(bkkDayStart(toDate) + DAY_MS - 1).toISOString() : undefined

  const query = useInfiniteQuery({
    queryKey: queryKeys.auditLogs(category, actor, fromDate, toDate),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api("/audit-logs", auditPageSchema, {
        query: {
          limit: String(PAGE_SIZE),
          cursor: pageParam ?? undefined,
          entityTypes: entityTypes?.join(","),
          actorId,
          actorType,
          from: fromIso,
          to: toIso
        }
      }),
    getNextPageParam: (page) => page.nextCursor
  })

  const entries = query.data?.pages.flatMap((page) => page.entries) ?? []

  const actorOptions = [
    { value: ALL, label: "Everyone" },
    ...(staff.data ?? []).map((member) => ({ value: member.id, label: member.name })),
    { value: GUESTS, label: "Guests (public)" }
  ]

  const filterSummary = activityFilterSummary(category, actor, fromDate, toDate, actorOptions)
  const filterFields = (
    <ActivityFilters
      category={draftFilters.category}
      actor={draftFilters.actor}
      fromDate={draftFilters.fromDate}
      toDate={draftFilters.toDate}
      staffPending={staff.isPending}
      actorOptions={actorOptions}
      onFilterChange={setDraftFilter}
    />
  )
  const filterActions = (
    <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
      <Button variant="secondary" onClick={clearDraftFilters}>
        Clear
      </Button>
      <Button onClick={applyFilters}>
        Apply filters
      </Button>
    </div>
  )
  const filterButton = (
    <Button
      variant="secondary"
      size="sm"
      aria-label={filterSummary.length ? `Filter, ${filterSummary.length} active` : "Filter"}
            onClick={openFilters}
    >
      <ListFilter className="h-4 w-4" aria-hidden="true" />
      Filter
      {filterSummary.length ? (
        <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 type-meta tabular-nums">
          {filterSummary.length}
        </span>
      ) : null}
    </Button>
  )

  const header = (
    <header className="p-2 pb-0 sm:p-3 sm:pb-0">
      <div data-testid="activity-command-surface" className="mx-auto max-w-4xl rounded-hero border border-border bg-card p-4 shadow-xs sm:p-5">
        <div className="flex min-h-11 items-start justify-between gap-3">
          <div className="min-w-0">
            <PageTitle>Activity</PageTitle>
            <p className="mt-1 type-ui text-muted-foreground">A chronological record of clinic changes.</p>
          </div>
          {isDesktop ? (
            <Popover open={filterOpen} onOpenChange={onFilterOpenChange}>
  <PopoverTrigger asChild>{filterButton}</PopoverTrigger>
  <PopoverContent align="end" className="w-[34rem]">
    {filterFields}
    {filterActions}
  </PopoverContent>
            </Popover>
          ) : (
            <>
  {filterButton}
  <Sheet
    open={filterOpen}
    onOpenChange={onFilterOpenChange}
    side="bottom"
    title="Filter activity"
    footer={
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={clearDraftFilters}>
          Clear
        </Button>
        <Button className="flex-1" onClick={applyFilters}>
          Apply filters
        </Button>
      </div>
    }
  >
    {filterFields}
  </Sheet>
            </>
          )}
        </div>
        {hasActiveFilters ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {filterSummary.map((summary) => (
  <span key={summary} className="rounded-full border border-border bg-surface-subtle px-3 py-1 type-meta font-semibold text-foreground">{summary}</span>
            ))}
            <Button variant="ghost" size="sm" className="px-2" onClick={clearFilters}>
  Clear filters
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  )

  const body = () => {
    if (query.isPending) {
      return (
        <div
          data-testid="activity-loading"
          aria-busy="true"
          aria-label="Loading activity"
          className="space-y-6"
        >
          {Array.from({ length: 2 }, (_, group) => (
            <section key={group}>
  <Skeleton className="mb-2 h-5 w-24" />
  <div className="overflow-hidden rounded-card border border-border bg-card shadow-xs">
    {Array.from({ length: 3 }, (_, row) => (
      <div
        key={row}
        data-testid="activity-row-skeleton"
        className="grid min-h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-border px-4 py-3 last:border-b-0"
      >
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-3.5 w-48 max-w-full" />
          <Skeleton className="h-3 w-32 max-w-full" />
        </div>
        <Skeleton className="h-3 w-10 shrink-0" />
      </div>
    ))}
  </div>
            </section>
          ))}
        </div>
      )
    }

    if (query.isError && entries.length === 0) {
      return (
        <EmptyState
          icon={TriangleAlert}
          title="Could not load the activity log"
          hint="Retry shortly"
          action={<Button onClick={() => void query.refetch()}>Retry</Button>}
        />
      )
    }

    if (entries.length === 0) {
      return hasActiveFilters ? (
        <EmptyState
          icon={SearchX}
          title="No activity matches these filters"
          hint="Try widening the date range or clearing a filter."
          action={
            <Button variant="secondary" onClick={clearFilters}>
  Clear filters
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={History}
          title="No recorded activity yet"
          hint="Bookings, roster changes and cancellations appear here as staff work."
        />
      )
    }

    const today = bkkToday()
    const yesterday = bkkShiftDate(today, -1)

    const groupedEntries = entries.reduce<Record<string, AuditEntry[]>>((groups, entry) => {
      const day = bkkDate(entry.at.getTime())
      const key = day === today ? "Today" : day === yesterday ? "Yesterday" : fmtDay(day)
      if (!groups[key]) groups[key] = []
      groups[key].push(entry)
      return groups
    }, {})

    return (
      <>
        <div className="space-y-6">
          {Object.entries(groupedEntries).map(([groupDate, groupEntries]) => (
            <section key={groupDate}>
  <h2 className="sticky top-0 z-10 mb-2 border-b border-border bg-background/95 px-1 py-2 type-ui font-semibold tracking-wide text-muted-foreground backdrop-blur">
    {groupDate}
  </h2>
  <ul
    aria-label={groupDate}
    className="overflow-hidden rounded-card border border-border bg-card shadow-xs"
  >
    {groupConsecutiveActivity(groupEntries).map((cluster) => (
      <ActivityRow
        key={entryKey(cluster.entries[0]!)}
        cluster={cluster}
        staffById={staffById}
        servicesById={servicesById}
      />
    ))}
  </ul>
            </section>
          ))}
        </div>
        {query.isError && entries.length > 0 ? (
          <StatusCallout
            tone="destructive"
            icon={TriangleAlert}
            title="Could not load older activity"
            className="mt-4"
          >
            The activity already shown is still available.{" "}
            <button
  type="button"
  className="rounded-control px-1 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  onClick={() => void query.fetchNextPage()}
            >
  Retry
            </button>
          </StatusCallout>
        ) : null}
        {query.hasNextPage ? (
          <div className="flex justify-center pt-4">
            <Button
  variant="secondary"
                disabled={query.isFetchingNextPage}
  onClick={() => void query.fetchNextPage()}
            >
  {query.isFetchingNextPage ? "Loading older…" : "Load older"}
            </Button>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className="flex flex-col">
      {header}
      <div className="mx-auto w-full max-w-4xl p-2 sm:p-3">{body()}</div>
    </div>
  )
}

export const ActivityRoute = () =>
  useCanViewActivity() ? <ActivityPage /> : <Navigate to="/app/timeline" replace />
