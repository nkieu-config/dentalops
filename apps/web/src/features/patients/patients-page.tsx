import { patientPageSchema, type Patient } from "@dentalops/contracts"
import { useInfiniteQuery } from "@tanstack/react-query"
import { SearchX, TriangleAlert, Users } from "lucide-react"
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
      className="flex min-h-11 flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 hover:bg-accent"
    >
      <span className="min-w-0 flex-1 font-medium">{patient.name}</span>
      <span className="text-sm tabular-nums text-muted-foreground">{patient.phone}</span>
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
        <div className="flex flex-col items-center gap-3">
          <EmptyState
            icon={SearchX}
            title={`No patient matches “${search}”`}
            hint="Try part of a name or a phone number."
          />
          <Button variant="secondary" className="min-h-11" onClick={clearSearch}>
            Clear the search
          </Button>
        </div>
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
        <ul aria-label="Patients" className="rounded-md border border-border">
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
      <h1 className="px-1 pb-3 text-lg font-semibold">Patients</h1>
      <div className="space-y-1 pb-4">
        <Label htmlFor="patient-search">Search patients</Label>
        <Input
          id="patient-search"
          type="search"
          autoComplete="off"
          className="h-11 sm:h-9"
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
