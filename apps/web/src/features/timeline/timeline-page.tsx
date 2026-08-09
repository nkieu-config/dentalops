import type { Appointment, StaffMember } from "@dentalops/contracts"
import { CalendarX, Plus, TriangleAlert, UserPlus } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "react-router"
import { OFFLINE_MESSAGE } from "../../components/shell/offline-banner"
import { Button } from "../../components/ui/button"
import { EmptyState } from "../../components/ui/empty-state"
import { NativeSelect } from "../../components/ui/native-select"
import { Skeleton } from "../../components/ui/skeleton"
import { StatusCallout } from "../../components/ui/status-callout"
import { useRealtime } from "../../lib/realtime"
import { useCanBook, useCanManageStaff } from "../../lib/session"
import { useMediaQuery } from "../../lib/use-media-query"
import { useOnline } from "../../lib/use-online"
import { StaffDialog } from "../staff/staff-dialog"
import { AgendaView } from "./agenda-view"
import { AppointmentCard } from "./appointment-card"
import { AppointmentDrawer } from "./appointment-drawer"
import { ColumnPicker } from "./column-picker"
import { CreateDrawer, type CreateDraft } from "./create-drawer"
import { useAppointments, useBranches, useChairs, useDentists, useShifts } from "./hooks"
import { bkkDayStart, bkkToday, msToY } from "./lib/geometry"
import { layoutByDentist } from "./lib/lanes"
import { TimeGrid } from "./time-grid"
import { TimelineToolbar } from "./timeline-toolbar"
import { columnModeFrom, useColumnMode } from "./use-column-mode"
import { useDragCreate } from "./use-drag-create"
import { useDragMove } from "./use-drag-move"
import { useGridKeyboard } from "./use-grid-keyboard"
import { useRescheduleAppointment } from "./use-reschedule"

const CONFLICT_HIGHLIGHT_MS = 2500
const ARRIVAL_HIGHLIGHT_MS = 1500
const OFFLINE_REASON_ID = "add-staff-offline-reason"
const HOUR_MS = 3_600_000
const NEW_APPOINTMENT_HOUR = 9

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
  const chairs = useChairs(branchId, columnModeFrom(params) === "chair")
  const shifts = useShifts(branchId, dayStart)
  const appointments = useAppointments(branchId, dayStart)
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [draft, setDraft] = useState<CreateDraft | null>(null)
  const [conflictId, setConflictId] = useState<string | null>(null)
  const [arrivedId, setArrivedId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [hiddenColumns, setHiddenColumns] = useState<ReadonlySet<string>>(() => new Set())
  const [addingStaff, setAddingStaff] = useState(false)
  const online = useOnline()
  const canCreate = useCanBook() && online
  const canAddStaff = useCanManageStaff()
  const mode = useTimelineMode()
  const columnEls = useRef(new Map<string, HTMLDivElement>())

  const lanePositions = useMemo(
    () => layoutByDentist(appointments.data ?? []),
    [appointments.data]
  )
  const allDentists = useMemo(() => dentists.data ?? [], [dentists.data])
  const allChairs = useMemo(() => chairs.data ?? [], [chairs.data])
  const {
    mode: columnMode,
    setMode: setColumnMode,
    columns,
    columnOf
  } = useColumnMode({ dentists: allDentists, chairs: allChairs })
  const gridColumns = useMemo(
    () => (mode === "md" ? columns.filter((c) => !hiddenColumns.has(c.id)) : columns),
    [columns, hiddenColumns, mode]
  )
  const canDrag = canCreate && columnMode === "dentist"
  const dragColumnIds = useMemo(
    () => (canDrag ? gridColumns.map((c) => c.id) : []),
    [canDrag, gridColumns]
  )
  const unseated = useMemo(
    () => (appointments.data ?? []).filter((a) => columnOf(a) === null),
    [appointments.data, columnOf]
  )
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
    dentistIds: dragColumnIds,
    columnLefts: () =>
      dragColumnIds.map((id) => columnEls.current.get(id)?.getBoundingClientRect().left ?? 0),
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

  const chairsPending = columnMode === "chair" && branchId !== undefined && chairs.isPending

  if (branches.isPending || dentists.isPending || chairsPending) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }
  if (branches.isError || dentists.isError || (columnMode === "chair" && chairs.isError)) {
    return <EmptyState icon={CalendarX} title="Could not load the clinic" hint="Retry shortly" />
  }
  if (allDentists.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <EmptyState
          icon={UserPlus}
          title="No dentists yet"
          hint="Add your first colleague to start building a schedule"
        />
        {canAddStaff ? (
          <div className="flex flex-col items-center gap-2">
            <Button
              className="min-h-11"
              onClick={() => setAddingStaff(true)}
              disabled={!online}
              title={online ? undefined : OFFLINE_MESSAGE}
              aria-describedby={online ? undefined : OFFLINE_REASON_ID}
            >
              Add a colleague
            </Button>
            {online ? null : (
              <p id={OFFLINE_REASON_ID} className="text-sm font-medium text-destructive">
                {OFFLINE_MESSAGE}
              </p>
            )}
          </div>
        ) : null}
        {addingStaff ? <StaffDialog onClose={() => setAddingStaff(false)} /> : null}
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-var(--spacing-topbar))] flex-col">
      <TimelineToolbar date={date} branchId={branchId} branches={branches.data} onChange={onChange}>
        {mode === "sm" ? null : (
          <NativeSelect
            aria-label="Column grouping"
            className="w-auto"
            value={columnMode}
            onChange={(e) => setColumnMode(e.target.value === "chair" ? "chair" : "dentist")}
          >
            <option value="dentist">Dentists</option>
            <option value="chair">Chairs</option>
          </NativeSelect>
        )}
        {mode === "md" ? (
          <ColumnPicker
            columns={columns}
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
        <Button
          size="sm"
          className="min-h-11"
          disabled={!canCreate || branchId === undefined}
          title={!online ? OFFLINE_MESSAGE : undefined}
          onClick={() =>
            branchId !== undefined && allDentists[0]
              ? setDraft({
                  dentist: allDentists[0],
                  branchId,
                  startsAt: dayStart + NEW_APPOINTMENT_HOUR * HOUR_MS
                })
              : undefined
          }
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New appointment
        </Button>
      </TimelineToolbar>
      {appointments.isError ? (
        <div className="px-4 pt-2">
          <StatusCallout tone="warning" icon={TriangleAlert} title="Appointments could not be loaded">
            The schedule below may be incomplete.{" "}
            <button
              type="button"
              className="font-semibold underline underline-offset-2"
              onClick={() => void appointments.refetch()}
            >
              Retry
            </button>
          </StatusCallout>
        </div>
      ) : null}
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
          {unseated.length > 0 ? (
            <p
              role="status"
              data-testid="unseated-notice"
              className="border-b border-border px-4 py-2 text-sm text-muted-foreground"
            >
              {unseated.length === 1
                ? "1 appointment is hidden here: it has released its chair, so no chair column can hold it. Switch to dentist columns to see it."
                : `${unseated.length} appointments are hidden here: they have released their chairs, so no chair column can hold them. Switch to dentist columns to see them.`}
            </p>
          ) : null}
          <TimeGrid
            date={date}
            snap={mode === "md"}
            columns={gridColumns}
            columnOf={columnOf}
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
                onMoveStart={canDrag ? drag.startMove(a) : undefined}
                onResizeStart={canDrag ? drag.startResize(a) : undefined}
                dimmed={drag.preview?.id === a.id}
                conflict={conflictId === a.id}
                arrived={arrivedId === a.id}
              />
            )}
            columnPreview={(column, ds) =>
              preview && preview.dentistId === column.id ? (
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
              branchId === undefined || !canDrag
                ? undefined
                : (column, ds) => {
                    const dentist = allDentists.find((d) => d.id === column.id)
                    if (!dentist) return null
                    return (
                      <DragOverlay
                        key={dentist.id}
                        dentist={dentist}
                        dayStart={ds}
                        branchId={branchId}
                        onDraft={setDraft}
                      />
                    )
                  }
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
      {draft ? (
        <CreateDrawer
          draft={draft}
          dentists={allDentists}
          dayStart={dayStart}
          onClose={() => setDraft(null)}
        />
      ) : null}
    </div>
  )
}
