import { appointmentSchema, patientPageSchema, type StaffMember } from "@dentalops/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useState } from "react"
import { toast } from "sonner"
import { Button } from "../../components/ui/button"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { NativeSelect } from "../../components/ui/native-select"
import { Sheet } from "../../components/ui/sheet"
import { api, ApiError } from "../../lib/api"
import { useServices } from "./hooks"
import { fmtTime } from "./lib/geometry"

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

  const patients = useQuery({
    queryKey: ["patients", search],
    queryFn: () =>
      api("/patients", patientPageSchema, { query: { q: search || undefined, limit: "20" } })
  })

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
      void queryClient.invalidateQueries({ queryKey: ["appointments"] })
      toast.success("Appointment booked")
      onClose()
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Booking failed")
    }
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (draft && serviceId && patientId) create.mutate(draft)
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
          <Button
            type="submit"
            className="w-full"
            disabled={!serviceId || !patientId || create.isPending}
          >
            Book appointment
          </Button>
        </form>
      ) : null}
    </Sheet>
  )
}
