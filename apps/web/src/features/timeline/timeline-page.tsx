import type { Appointment, StaffMember } from "@dentalops/contracts"
import { CalendarX } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { EmptyState } from "../../components/ui/empty-state"
import { Skeleton } from "../../components/ui/skeleton"
import { useRealtime } from "../../lib/realtime"
import { useCanBook } from "../../lib/session"
import { useMediaQuery } from "../../lib/use-media-query"
import { useOnline } from "../../lib/use-online"
import { AgendaView } from "./agenda-view"
import { AppointmentCard } from "./appointment-card"
import { AppointmentDrawer } from "./appointment-drawer"
import { ColumnPicker } from "./column-picker"
import { CreateDrawer, type CreateDraft } from "./create-drawer"
import { useAppointments, useBranches, useDentists, useShifts } from "./hooks"
import { bkkDayStart, bkkToday, msToY } from "./lib/geometry"
import { layoutByDentist } from "./lib/lanes"
import { TimeGrid } from "./time-grid"
import { TimelineToolbar } from "./timeline-toolbar"
import { useDragCreate } from "./use-drag-create"
import { useDragMove } from "./use-drag-move"
import { useGridKeyboard } from "./use-grid-keyboard"
import { useRescheduleAppointment } from "./use-reschedule"

const CONFLICT_HIGHLIGHT_MS = 2500
const ARRIVAL_HIGHLIGHT_MS = 1500

type TimelineMode = "sm" | "md" | "lg"

const useTimelineMode = (): TimelineMode => {
  const isSmall = useMediaQuery("(max-width: 767px)")
  const isMedium = useMediaQuery("(min-width: 768px) and (max-width: 1023px)")
  if (isSmall) return "sm"
  return isMedium ? "md" : "lg"
}

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
  const [conflictId, setConflictId] = useState<string | null>(null)
  const [arrivedId, setArrivedId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [hiddenColumns, setHiddenColumns] = useState<ReadonlySet<string>>(() => new Set())
  const online = useOnline()
  const canCreate = useCanBook() && online
  const mode = useTimelineMode()
  const columnEls = useRef(new Map<string, HTMLDivElement>())

  const lanePositions = useMemo(
    () => layoutByDentist(appointments.data ?? []),
    [appointments.data]
  )
  const allDentists = useMemo(() => dentists.data ?? [], [dentists.data])
  const gridDentists = useMemo(
    () => (mode === "md" ? allDentists.filter((d) => !hiddenColumns.has(d.id)) : allDentists),
    [allDentists, hiddenColumns, mode]
  )
  const dentistIds = useMemo(() => gridDentists.map((d) => d.id), [gridDentists])
  const dayKey = useMemo(() => ["appointments", branchId, dayStart], [branchId, dayStart])

  const { reschedule, isBusy } = useRescheduleAppointment({
    queryKey: dayKey,
    onConflict: setConflictId,
    onAnnounce: setAnnouncement
  })

  useRealtime({
    branchId,
    queryKey: dayKey,
    onChange: (event) => {
      if (event.action !== "created") {
        setAnnouncement("A booking on this day changed")
        return
      }
      setArrivedId(event.appointmentId)
      setAnnouncement("A new booking just arrived on this day")
    }
  })

  const keyboard = useGridKeyboard({ reschedule, isBusy: (id) => !online || isBusy(id) })

  const drag = useDragMove({
    dentistIds,
    columnLefts: () =>
      dentistIds.map((id) => columnEls.current.get(id)?.getBoundingClientRect().left ?? 0),
    isBusy,
    onDrop: reschedule
  })

  const preview = useMemo(() => {
    if (!drag.preview) return null
    const source = (appointments.data ?? []).find((a) => a.id === drag.preview?.id)
    if (!source) return null
    return {
      ...source,
      dentistId: drag.preview.dentistId,
      startsAt: new Date(drag.preview.startMs).toISOString(),
      endsAt: new Date(drag.preview.endMs).toISOString()
    }
  }, [drag.preview, appointments.data])

  useEffect(() => {
    if (conflictId === null) return
    const timer = setTimeout(() => setConflictId(null), CONFLICT_HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [conflictId])

  useEffect(() => {
    if (arrivedId === null) return
    const timer = setTimeout(() => setArrivedId(null), ARRIVAL_HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [arrivedId])

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
      <TimelineToolbar date={date} branchId={branchId} branches={branches.data} onChange={onChange}>
        {mode === "md" ? (
          <ColumnPicker
            dentists={allDentists}
            hidden={hiddenColumns}
            onToggle={(id) =>
              setHiddenColumns((current) => {
                const next = new Set(current)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                return next
              })
            }
          />
        ) : null}
      </TimelineToolbar>
      {mode === "sm" ? (
        <AgendaView
          appointments={appointments.data ?? []}
          dentists={allDentists}
          date={date}
          conflictId={conflictId}
          onOpen={setSelected}
        />
      ) : (
        <div className="contents" onKeyDown={keyboard.onKeyDown}>
          <TimeGrid
            date={date}
            snap={mode === "md"}
            dentists={gridDentists}
            shifts={shifts.data ?? []}
            appointments={appointments.data ?? []}
            columnRef={(id, element) => {
              if (element) columnEls.current.set(id, element)
              else columnEls.current.delete(id)
            }}
            renderAppointment={(a, ds) => (
              <AppointmentCard
                key={a.id}
                appointment={a}
                dayStart={ds}
                lane={lanePositions.get(a.id)?.lane ?? 0}
                lanes={lanePositions.get(a.id)?.lanes ?? 1}
                onClick={(picked) => {
                  if (!drag.consumeDrag()) setSelected(picked)
                }}
                onMoveStart={canCreate ? drag.startMove(a) : undefined}
                onResizeStart={canCreate ? drag.startResize(a) : undefined}
                dimmed={drag.preview?.id === a.id}
                conflict={conflictId === a.id}
                arrived={arrivedId === a.id}
              />
            )}
            columnPreview={(dentist, ds) =>
              preview && preview.dentistId === dentist.id ? (
                <AppointmentCard
                  appointment={preview}
                  dayStart={ds}
                  lane={0}
                  lanes={1}
                  onClick={() => {}}
                  preview
                />
              ) : null
            }
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
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <AppointmentDrawer
        appointment={selected}
        onClose={() => setSelected(null)}
        onReschedule={reschedule}
      />
      {draft ? <CreateDrawer draft={draft} onClose={() => setDraft(null)} /> : null}
    </div>
  )
}
