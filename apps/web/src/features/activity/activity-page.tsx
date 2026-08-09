import { auditPageSchema, type AuditEntry } from "@dentalops/contracts"
import { useInfiniteQuery } from "@tanstack/react-query"
import { History, TriangleAlert } from "lucide-react"
import { Navigate } from "react-router"
import { Button } from "../../components/ui/button"
import { EmptyState } from "../../components/ui/empty-state"
import { InitialsAvatar } from "../../components/ui/initials-avatar"
import { Skeleton } from "../../components/ui/skeleton"
import { api } from "../../lib/api"
import { useCanViewActivity } from "../../lib/session"
import { bkkDate, bkkToday, fmtDay, fmtTime } from "../timeline/lib/geometry"

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

const STATUS_WORDS: Record<string, string> = {
  completed: "marked an appointment completed",
  cancelled: "cancelled an appointment",
  no_show: "marked an appointment a no-show",
  confirmed: "confirmed an appointment"
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
    const status = statusOf(entry.after)
    return (status ? STATUS_WORDS[status] : undefined) ?? "changed an appointment's status"
  }
  const known = ACTION_WORDS[entry.action]
  if (known) return known
  const noun = nounFor(entry.entity.type)
  const verb = VERB_WORDS[entry.action.split(" ")[0] ?? ""] ?? "changed"
  return `${verb} ${articleFor(noun)} ${noun}`
}

const entryKey = (entry: AuditEntry): string =>
  [entry.at.toISOString(), entry.requestId, entry.action, entry.entity.id].join("|")

const ActivityRow = ({ entry }: { entry: AuditEntry }) => {
  const at = entry.at.getTime()
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0">
      <InitialsAvatar name={entry.actor.name} />
      <p className="flex-1 text-sm">
        <span className="font-medium text-foreground">{entry.actor.name}</span>{" "}
        <span className="text-muted-foreground">{describeAction(entry)}</span>
        {entry.entity.id ? (
          <span className="text-muted-foreground">
            {" "}
            — {nounFor(entry.entity.type)} {entry.entity.id.slice(0, 8)}
          </span>
        ) : null}
      </p>
      <time
        dateTime={entry.at.toISOString()}
        className="text-xs font-medium tabular-nums text-muted-foreground"
      >
        {fmtTime(at)}
      </time>
    </li>
  )
}

export const ActivityPage = () => {
  const query = useInfiniteQuery({
    queryKey: ["audit-logs"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api("/audit-logs", auditPageSchema, {
        query: { limit: String(PAGE_SIZE), cursor: pageParam ?? undefined }
      }),
    getNextPageParam: (page) => page.nextCursor
  })

  const entries = query.data?.pages.flatMap((page) => page.entries) ?? []

  const heading = <h1 className="pb-4 text-xl font-semibold tracking-tight">Clinic activity</h1>

  if (query.isPending) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        {heading}
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (query.isError) {
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
    return (
      <EmptyState
        icon={History}
        title="Nothing has happened yet"
        hint="Bookings, roster changes and cancellations appear here as staff work."
      />
    )
  }

  const groupedEntries = entries.reduce<Record<string, AuditEntry[]>>((groups, entry) => {
    const day = fmtDay(bkkDate(entry.at.getTime()))
    const key = day === fmtDay(bkkToday()) ? "Today" : day
    if (!groups[key]) groups[key] = []
    groups[key].push(entry)
    return groups
  }, {})

  return (
    <div className="mx-auto max-w-3xl p-4">
      {heading}
      <div className="space-y-6">
        {Object.entries(groupedEntries).map(([groupDate, groupEntries]) => (
          <section key={groupDate}>
            <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted-foreground">
              {groupDate}
            </h2>
            <ul aria-label={groupDate} className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
              {groupEntries.map((entry) => (
                <ActivityRow key={entryKey(entry)} entry={entry} />
              ))}
            </ul>
          </section>
        ))}
      </div>
      {query.hasNextPage ? (
        <div className="flex justify-center pt-4">
          <Button
            variant="secondary"
            className="min-h-11"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading older" : "Load older"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export const ActivityRoute = () =>
  useCanViewActivity() ? <ActivityPage /> : <Navigate to="/app/timeline" replace />
