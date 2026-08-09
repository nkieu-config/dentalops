import {
  patientDetailSchema,
  type AppointmentStatus,
  type PatientAppointment
} from "@dentalops/contracts"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, CalendarOff, Mail, Phone, TriangleAlert } from "lucide-react"
import { Link, useParams, useSearchParams } from "react-router"
import { buttonVariants } from "../../components/ui/button"
import { EmptyState } from "../../components/ui/empty-state"
import { InitialsAvatar } from "../../components/ui/initials-avatar"
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
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
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
          <div className="flex flex-col gap-4 pb-6 pt-4 sm:flex-row sm:items-start sm:gap-6">
            <InitialsAvatar name={patient.name} className="h-16 w-16 text-xl" />
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{patient.name}</h1>
              <div className="flex flex-wrap gap-2 pt-2">
                <a href={`tel:${patient.phone}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  <Phone className="mr-1.5 h-3.5 w-3.5" />
                  {patient.phone}
                </a>
                <a href={`mailto:${patient.email}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  {patient.email}
                </a>
              </div>
            </div>
          </div>
          
          {patient.notes ? (
            <div className="mb-6 rounded-md border border-border bg-surface-subtle p-4">
              <h3 className="mb-1 text-sm font-semibold text-foreground">Front-desk note</h3>
              <p className="text-sm text-muted-foreground">{patient.notes}</p>
            </div>
          ) : null}

          {patient.appointments.length === 0 ? (
            <>
              <h2 className="px-1 pb-2 text-base font-semibold">Appointment history</h2>
              <EmptyState
                icon={CalendarOff}
                title="No appointments yet"
                hint="Bookings for this patient will be listed here."
              />
            </>
          ) : (
            <div className="space-y-6">
              {[
                { label: "Upcoming", filter: (a: PatientAppointment) => a.status === "confirmed" },
                { label: "Previous", filter: (a: PatientAppointment) => a.status === "completed" },
                { label: "Cancelled / No-show", filter: (a: PatientAppointment) => ["cancelled", "no_show"].includes(a.status) },
              ].map(({ label, filter }) => {
                const group = patient.appointments.filter(filter)
                if (group.length === 0) return null
                return (
                  <section key={label}>
                    <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-muted-foreground">
                      {label}
                    </h2>
                    <ul aria-label={label} className="overflow-hidden rounded-md border border-border bg-card shadow-sm">
                      {group.map((appointment) => (
                        <HistoryRow key={appointment.id} appointment={appointment} />
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
