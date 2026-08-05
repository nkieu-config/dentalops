import { patientPageSchema, type Patient } from "@dentalops/contracts"
import { useInfiniteQuery } from "@tanstack/react-query"
import { ChevronRight, SearchX, TriangleAlert, Users } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { Button } from "../../components/ui/button"
import { EmptyState } from "../../components/ui/empty-state"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Skeleton } from "../../components/ui/skeleton"
import { api } from "../../lib/api"

const PAGE_SIZE = 20
const DEBOUNCE_MS = 300

export const detailPath = (patientId: string, search: string): string => {
  const base = `/app/patients/${patientId}`
  return search ? `${base}?${new URLSearchParams({ q: search })}` : base
}

const PatientRow = ({ patient, search }: { patient: Patient; search: string }) => (
  <li className="border-b border-border last:border-b-0">
    <Link
      to={detailPath(patient.id, search)}
      className="flex min-h-11 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1 truncate font-medium">{patient.name}</span>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{patient.phone}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  </li>
)

export const PatientsPage = () => {
  const [params, setParams] = useSearchParams()
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
    queryKey: ["patients", search],
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

  const clearSearch = () => {
    setDraft("")
    setParams({}, { replace: true })
  }

  const body = () => {
    if (query.isPending) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      )
    }

    if (query.isError) {
      return (
        <EmptyState
          icon={TriangleAlert}
          title="Could not load the patients"
          hint="Retry shortly"
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
        />
      )
    }

    return (
      <>
        <ul aria-label="Patients" className="overflow-hidden rounded-md border border-border bg-card">
          {patients.map((patient) => (
            <PatientRow key={patient.id} patient={patient} search={search} />
          ))}
        </ul>
        {query.hasNextPage ? (
          <div className="flex justify-center pt-4">
            <Button
              variant="secondary"
              className="min-h-11"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? "Loading more" : "Load more"}
            </Button>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="pb-4 text-xl font-semibold tracking-tight">Patients</h1>
      <div className="space-y-1.5 pb-5">
        <Label htmlFor="patient-search">Search patients</Label>
        <Input
          id="patient-search"
          type="search"
          autoComplete="off"
          placeholder="Name or phone number"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
        />
      </div>
      {body()}
    </div>
  )
}
