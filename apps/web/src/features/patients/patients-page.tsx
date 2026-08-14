import { patientPageSchema, type PatientListItem } from "@dentalops/contracts"
import { useInfiniteQuery } from "@tanstack/react-query"
import { ChevronRight, Loader2, Plus, Search, SearchX, TriangleAlert, Users, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { Button } from "../../components/ui/button"
import { PageTitle } from "../../components/ui/page-header"
import { EmptyState } from "../../components/ui/empty-state"
import { InitialsAvatar } from "../../components/ui/initials-avatar"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Skeleton } from "../../components/ui/skeleton"
import { StatusCallout } from "../../components/ui/status-callout"
import { api } from "../../lib/api"
import { queryKeys } from "../../lib/query-keys"
import { useCanBook } from "../../lib/session"
import { bkkDate, fmtScheduleDay, fmtTime } from "../timeline/lib/geometry"
import { PatientEditorSheet } from "./patient-editor-sheet"

const PAGE_SIZE = 20
const DEBOUNCE_MS = 300

export const detailPath = (patientId: string, search: string): string => {
  const base = `/app/patients/${patientId}`
  return search ? `${base}?${new URLSearchParams({ q: search })}` : base
}

const NextVisit = ({ nextAppointmentAt }: { nextAppointmentAt: string }) => {
  const at = Date.parse(nextAppointmentAt)
  return (
    <span className="hidden shrink-0 flex-col items-end type-meta text-muted-foreground sm:flex">
      <span>Next visit</span>
      <span className="font-medium tabular-nums text-foreground">
        {fmtScheduleDay(bkkDate(at))} · {fmtTime(at)}
      </span>
    </span>
  )
}

const PatientRow = ({ patient, search }: { patient: PatientListItem; search: string }) => (
  <li className="border-b border-border last:border-b-0">
    <Link
      to={detailPath(patient.id, search)}
      className="flex min-h-11 items-center gap-4 px-4 py-3 transition-[background-color,box-shadow] duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <InitialsAvatar name={patient.name} />
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate font-semibold text-foreground">{patient.name}</span>
        <span className="truncate type-ui text-muted-foreground">{patient.phone}</span>
      </div>
      {patient.nextAppointmentAt ? <NextVisit nextAppointmentAt={patient.nextAppointmentAt} /> : null}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  </li>
)

export const PatientsPage = () => {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const canCreate = useCanBook()
  const [creating, setCreating] = useState(false)
  const search = params.get("q") ?? ""
  const [draft, setDraft] = useState(search)

  useEffect(() => {
    setDraft(search)
  }, [search])

  useEffect(() => {
    if (draft === search) return
    const timer = setTimeout(() => {
      setParams(draft ? { q: draft } : {}, { replace: true })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [draft, search, setParams])

  const query = useInfiniteQuery({
    queryKey: queryKeys.patients.search(search),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api("/patients", patientPageSchema, {
        query: {
          limit: String(PAGE_SIZE),
          q: search || undefined,
          cursor: pageParam ?? undefined
        }
      }),
    getNextPageParam: (page) => page.nextCursor
  })

  const patients = query.data?.pages.flatMap((page) => page.items) ?? []

  const resultAnnouncement = query.isPending
    ? ""
    : query.isError
      ? "Could not load patients right now"
      : query.hasNextPage
        ? `${patients.length} patient${patients.length === 1 ? "" : "s"} shown, more available${
            search ? ` for “${search}”` : ""
          }`
        : `${patients.length} patient${patients.length === 1 ? "" : "s"} found${
            search ? ` for “${search}”` : ""
          }`

  const clearSearch = () => {
    setDraft("")
    setParams({}, { replace: true })
  }

  const body = () => {
    if (query.isPending) {
      return (
        <section data-testid="patient-directory-loading" aria-busy="true" aria-label="Loading patients" className="overflow-hidden rounded-card border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="border-t border-border">
            {Array.from({ length: 6 }, (_, index) => (
  <div
    key={index}
    data-testid="patient-row-skeleton"
    className="flex min-h-16 items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
  >
    <Skeleton className="size-9 shrink-0 rounded-full" />
    <div className="min-w-0 flex-1 space-y-2">
      <Skeleton className="h-3.5 w-40 max-w-full" />
      <Skeleton className="h-3 w-24" />
    </div>
  </div>
            ))}
          </div>
        </section>
      )
    }

    if (query.isError && patients.length === 0) {
      return (
        <EmptyState
          icon={TriangleAlert}
          title="Could not load the patients"
          hint="Retry shortly"
          action={<Button onClick={() => void query.refetch()}>Retry</Button>}
        />
      )
    }

    if (patients.length === 0) {
      return search ? (
        <EmptyState
          icon={SearchX}
          title={`No patient matches “${search}”`}
          hint="Try part of a name, or the last few digits of a phone number."
          action={
            <Button variant="secondary" onClick={clearSearch}>
  Clear the search
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={Users}
          title="No patients yet"
          hint="Patients appear here as soon as somebody books, online or at the desk."
          action={canCreate ? <Button onClick={() => setCreating(true)}>New patient</Button> : undefined}
        />
      )
    }

    return (
      <>
        <section data-testid="patient-directory-canvas" className="overflow-hidden rounded-card border border-border bg-card shadow-xs">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <h2 className="type-meta font-medium uppercase tracking-wide text-muted-foreground">
  {search ? "Search results" : "Recently added"}
            </h2>
            <span className="type-meta font-medium tabular-nums text-muted-foreground">
  {patients.length} patient{patients.length === 1 ? "" : "s"} shown
  {query.hasNextPage ? " · More available" : ""}
            </span>
          </div>
          <ul aria-label="Patients" className="border-t border-border">
            {patients.map((patient) => (
  <PatientRow key={patient.id} patient={patient} search={search} />
            ))}
          </ul>
        </section>
        {query.isFetchNextPageError ? (
          <StatusCallout
            tone="destructive"
            icon={TriangleAlert}
            title="Could not load more patients"
            className="mt-3"
          >
            <button
  type="button"
  className="rounded-control px-1 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  onClick={() => void query.fetchNextPage()}
            >
  Retry
            </button>
          </StatusCallout>
        ) : query.hasNextPage ? (
          <div className="flex justify-center pt-4">
            <Button
  variant="secondary"
                disabled={query.isFetchingNextPage}
  onClick={() => void query.fetchNextPage()}
            >
  {query.isFetchingNextPage ? "Loading more…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className="flex flex-col p-2 sm:p-3">
      <section
        data-testid="patients-command-surface"
        className="mx-auto w-full max-w-4xl rounded-hero border border-border bg-card p-4 shadow-xs sm:p-5"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 sm:items-center">
            <PageTitle className="min-w-0">Patients</PageTitle>
            {canCreate ? (
  <Button className="shrink-0" onClick={() => setCreating(true)}>
    <Plus className="size-4" aria-hidden="true" />
    New patient
  </Button>
            ) : null}
            <p className="col-span-2 type-supporting text-muted-foreground">Patient contacts and appointment history</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="patient-search">Search patients</Label>
            <div className="relative">
  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
  <Input
    id="patient-search"
    name="patient-search"
    type="search"
    autoComplete="off"
    placeholder="e.g. Anong or 081…"
    className="pl-10 pr-12 [&::-webkit-search-cancel-button]:appearance-none"
    value={draft}
    onChange={(event) => {
      setDraft(event.target.value)
    }}
  />
  {draft !== search || (query.isFetching && !query.isFetchingNextPage) ? (
    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
    </div>
  ) : draft ? (
    <button
      type="button"
      aria-label="Clear search"
      className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={clearSearch}
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  ) : null}
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto w-full max-w-4xl pt-4">
        <p role="status" aria-live="polite" className="sr-only">
          {resultAnnouncement}
        </p>
        {body()}
      </div>
      <PatientEditorSheet
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(saved) => navigate(`/app/patients/${saved.id}`)}
      />
    </div>
  )
}
