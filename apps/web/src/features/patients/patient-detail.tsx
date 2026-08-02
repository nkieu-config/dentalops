import {
  patientDetailSchema,
  type AppointmentStatus,
  type PatientAppointment
} from "@dentalops/contracts"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, CalendarOff, TriangleAlert } from "lucide-react"
import { Link, useParams, useSearchParams } from "react-router"
import { EmptyState } from "../../components/ui/empty-state"
import { Skeleton } from "../../components/ui/skeleton"
import { api } from "../../lib/api"
import { bkkDate, fmtDay, fmtTime } from "../timeline/lib/geometry"

const STATUS_WORDS: Record<AppointmentStatus, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show"
}

const HistoryRow = ({ appointment }: { appointment: PatientAppointment }) => {
  const at = Date.parse(appointment.startsAt)
  const day = bkkDate(at)
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        to={`/app/timeline?d=${day}&b=${appointment.branchId}`}
        className="flex min-h-11 flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 hover:bg-accent"
      >
        <span className="min-w-0 flex-1 font-medium">{appointment.service.name}</span>
        <span className="text-sm text-muted-foreground">{appointment.dentist.name}</span>
        <time
          dateTime={appointment.startsAt}
          className="text-sm tabular-nums text-muted-foreground"
        >
          {fmtDay(day)} · {fmtTime(at)}
        </time>
        <span className="text-sm text-muted-foreground">{STATUS_WORDS[appointment.status]}</span>
      </Link>
    </li>
  )
}

export const PatientDetail = () => {
  const { id } = useParams()
  const [params] = useSearchParams()
  const search = params.get("q") ?? ""
  const backTo = search ? `/app/patients?${new URLSearchParams({ q: search })}` : "/app/patients"

  const query = useQuery({
    queryKey: ["patient", id],
    queryFn: () => api(`/patients/${id}`, patientDetailSchema)
  })

  const patient = query.data

  return (
    <div className="mx-auto max-w-3xl p-4">
      <Link
        to={backTo}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to patients
      </Link>

      {query.isPending ? (
        <div className="space-y-2 pt-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : null}

      {query.isError ? (
        <EmptyState
          icon={TriangleAlert}
          title="Could not load this patient"
          hint="They may have been removed, or the clinic you are signed into does not have them."
        />
      ) : null}

      {patient ? (
        <>
          <h1 className="pt-3 text-lg font-semibold">{patient.name}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pb-4 text-sm">
            <a className="underline underline-offset-2" href={`tel:${patient.phone}`}>
              {patient.phone}
            </a>
            <a className="underline underline-offset-2" href={`mailto:${patient.email}`}>
              {patient.email}
            </a>
          </div>
          {patient.notes ? (
            <p className="pb-4 text-sm text-muted-foreground">{patient.notes}</p>
          ) : null}

          <h2 className="px-1 pb-2 text-base font-semibold">Appointment history</h2>
          {patient.appointments.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="No appointments yet"
              hint="Bookings for this patient will be listed here."
            />
          ) : (
            <ul aria-label="Appointment history" className="rounded-md border border-border">
              {patient.appointments.map((appointment) => (
                <HistoryRow key={appointment.id} appointment={appointment} />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </div>
  )
}
