import type { Appointment, StaffMember } from "@dentalops/contracts"
import { CalendarX } from "lucide-react"
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { EmptyState } from "../../components/ui/empty-state"
import { Skeleton } from "../../components/ui/skeleton"
import { useCanBook } from "../../lib/session"
import { AppointmentCard } from "./appointment-card"
import { AppointmentDrawer } from "./appointment-drawer"
import { CreateDrawer, type CreateDraft } from "./create-drawer"
import { useAppointments, useBranches, useDentists, useShifts } from "./hooks"
import { bkkDayStart, bkkToday, msToY } from "./lib/geometry"
import { layoutByDentist } from "./lib/lanes"
import { TimeGrid } from "./time-grid"
import { TimelineToolbar } from "./timeline-toolbar"
import { useDragCreate } from "./use-drag-create"

interface DragOverlayProps {
  dentist: StaffMember
  dayStart: number
  branchId: string
  onDraft: (draft: CreateDraft) => void
}

const DragOverlay = ({ dentist, dayStart, branchId, onDraft }: DragOverlayProps) => {
  const { overlayProps, ghost } = useDragCreate({
    dayStart,
    onSelect: (range) => onDraft({ dentist, branchId, startsAt: range.start })
  })
  return (
    <div className="absolute inset-0" data-testid={`overlay-${dentist.id}`} {...overlayProps}>
      {ghost ? (
        <div
          className="pointer-events-none absolute inset-x-0.5 rounded-sm border-2 border-dashed border-primary"
          data-testid="ghost"
          style={{
            top: msToY(ghost.start, dayStart),
            height: msToY(ghost.end, dayStart) - msToY(ghost.start, dayStart),
            backgroundColor: "color-mix(in srgb, var(--color-primary) 10%, transparent)"
          }}
        />
      ) : null}
    </div>
  )
}

export const TimelinePage = () => {
  const [params, setParams] = useSearchParams()
  const date = params.get("d") ?? bkkToday()
  const branches = useBranches()
  const branchId = params.get("b") ?? branches.data?.[0]?.id
  const dayStart = bkkDayStart(date)
  const dentists = useDentists()
  const shifts = useShifts(branchId, dayStart)
  const appointments = useAppointments(branchId, dayStart)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [draft, setDraft] = useState<CreateDraft | null>(null)
  const canCreate = useCanBook()

  const lanePositions = useMemo(
    () => layoutByDentist(appointments.data ?? []),
    [appointments.data]
  )

  const onChange = (next: { date?: string; branchId?: string }) => {
    const merged = new URLSearchParams(params)
    if (next.date) merged.set("d", next.date)
    if (next.branchId) merged.set("b", next.branchId)
    setParams(merged)
  }

  if (branches.isPending || dentists.isPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }
  if (branches.isError || dentists.isError) {
    return <EmptyState icon={CalendarX} title="Could not load the clinic" hint="Retry shortly" />
  }

  return (
    <div className="flex h-[calc(100dvh-var(--spacing-topbar))] flex-col">
      <TimelineToolbar date={date} branchId={branchId} branches={branches.data} onChange={onChange} />
      <div className="sticky top-0 z-20 flex border-b border-border bg-background pl-timegutter">
        {(dentists.data ?? []).map((d) => (
          <div key={d.id} className="min-w-col-min flex-1 truncate px-2 py-1 text-sm font-medium">
            {d.name}
          </div>
        ))}
      </div>
      <TimeGrid
        date={date}
        dentists={dentists.data ?? []}
        shifts={shifts.data ?? []}
        appointments={appointments.data ?? []}
        renderAppointment={(a, ds) => (
          <AppointmentCard
            key={a.id}
            appointment={a}
            dayStart={ds}
            lane={lanePositions.get(a.id)?.lane ?? 0}
            lanes={lanePositions.get(a.id)?.lanes ?? 1}
            onClick={setSelected}
          />
        )}
        columnOverlay={
          branchId === undefined || !canCreate
            ? undefined
            : (dentist, ds) => (
                <DragOverlay
                  key={dentist.id}
                  dentist={dentist}
                  dayStart={ds}
                  branchId={branchId}
                  onDraft={setDraft}
                />
              )
        }
      />
      <AppointmentDrawer appointment={selected} onClose={() => setSelected(null)} />
      {draft ? <CreateDrawer draft={draft} onClose={() => setDraft(null)} /> : null}
    </div>
  )
}
