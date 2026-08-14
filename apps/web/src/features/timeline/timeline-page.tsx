import type { Appointment, StaffMember } from "@dentalops/contracts"
import { CalendarX, Lock, Plus, TriangleAlert, UserPlus } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { OFFLINE_MESSAGE } from "../../components/shell/offline-banner"
import { Button } from "../../components/ui/button"
import { EmptyState } from "../../components/ui/empty-state"
import { SegmentedControl } from "../../components/ui/segmented-control"
import { Skeleton } from "../../components/ui/skeleton"
import { StatusCallout } from "../../components/ui/status-callout"
import { useRealtime } from "../../lib/realtime"
import { useCanBook, useCanManageStaff } from "../../lib/session"
import { searchShortcutLabel } from "../../lib/shortcut-label"
import { useMediaQuery } from "../../lib/use-media-query"
import { useOnline } from "../../lib/use-online"
import { StaffDialog } from "../staff/staff-dialog"
import { AgendaView } from "./agenda-view"
import { AppointmentCard } from "./appointment-card"
import { AppointmentDrawer } from "./appointment-drawer"
import { ColumnPicker } from "./column-picker"
import { CommandPalette } from "./command-palette"
import { CreateDrawer, type CreateDraft } from "./create-drawer"
import { KeyboardShortcuts } from "./keyboard-shortcuts"
import { ServiceLegend } from "./service-legend"
import { UnseatedNotice } from "./unseated-notice"
import {
  useAppointments,
  useBranches,
  useChairs,
  useDentists,
  useShifts,
  useWeekAppointments
} from "./hooks"
import { bkkDate, bkkDayStart, bkkToday, bkkWeekStart, fmtScheduleDay, msToY } from "./lib/geometry"
import { openingSpans, readOpeningHours } from "./lib/opening-hours"
import { layoutByDentist } from "./lib/lanes"
import { staffHue } from "./lib/staff-color"
import { TimeGrid, type ColumnMeta } from "./time-grid"
import { TimelineToolbar, type TimelineView } from "./timeline-toolbar"
import { columnModeFrom, useColumnMode, type TimelineColumn } from "./use-column-mode"
import { useDragCreate } from "./use-drag-create"
import { useDragMove } from "./use-drag-move"
import { useGridKeyboard } from "./use-grid-keyboard"
import { useRescheduleAppointment } from "./use-reschedule"
import { WeeklyAgendaBoard } from "./weekly-agenda-board"
import { queryKeys } from "../../lib/query-keys"

const CONFLICT_HIGHLIGHT_MS = 2500
const ARRIVAL_HIGHLIGHT_MS = 1500
const OFFLINE_REASON_ID = "add-staff-offline-reason"
const VIEW_PARAM = "v"
const HIDDEN_COLUMNS_PARAM = "h"
const DENTIST_FILTER_PARAM = "df"

type TimelineMode = "sm" | "md" | "lg"

const NO_APPOINTMENTS: Appointment[] = []

const useTimelineMode = (): TimelineMode => {
  const isSmall = useMediaQuery("(max-width: 767px)")
  const isMedium = useMediaQuery("(min-width: 768px) and (max-width: 1023px)")
  if (isSmall) return "sm"
  return isMedium ? "md" : "lg"
}

const viewFrom = (params: URLSearchParams): TimelineView =>
  params.get(VIEW_PARAM) === "week" ? "week" : "day"

const hiddenColumnsFrom = (params: URLSearchParams): ReadonlySet<string> =>
  new Set((params.get(HIDDEN_COLUMNS_PARAM) ?? "").split(",").filter(Boolean))

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

const ScheduleLoading = () => (
  <div
    data-testid="appointments-loading"
    aria-busy="true"
    aria-label="Loading appointments"
    className="min-h-0 flex flex-1 flex-col gap-2 p-2 sm:p-3"
  >
    <Skeleton className="h-12 w-full rounded-timeline-shell" />
    <Skeleton className="min-h-72 flex-1 w-full rounded-timeline-shell" />
  </div>
)

export const TimelinePage = () => {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const date = params.get("d") ?? bkkToday()
  const mode = useTimelineMode()
  const view: TimelineView = mode === "sm" ? "day" : viewFrom(params)
  const weekStart = bkkWeekStart(date)
  const branches = useBranches()
  const requestedBranchId = params.get("b")
  const knownBranch =
    requestedBranchId !== null &&
    branches.data?.some((branch) => branch.id === requestedBranchId) === true
  const branchId =
    branches.data === undefined
      ? (requestedBranchId ?? undefined)
      : knownBranch
        ? (requestedBranchId ?? undefined)
        : branches.data[0]?.id
  const unknownBranch = requestedBranchId !== null && branches.data !== undefined && !knownBranch
  const dayStart = bkkDayStart(date)
  const dentists = useDentists()
  const [selected, setSelected] = useState<Appointment | null>(null)
  const chairModeRequested = view === "day" && columnModeFrom(params) === "chair"
  const selectedNeedsChair = Boolean(
    selected?.claims.some((claim) => claim.status === "active")
  )
  const chairsEnabled = chairModeRequested || selectedNeedsChair
  const chairs = useChairs(branchId, chairsEnabled)
  const shifts = useShifts(branchId, dayStart, view === "day")
  const appointments = useAppointments(branchId, dayStart, view === "day")
  const weekAppointments = useWeekAppointments(branchId, weekStart, view === "week")
  const chairsPending = chairModeRequested && branchId !== undefined && chairs.isPending
  const [draft, setDraft] = useState<CreateDraft | null>(null)
  const [conflictId, setConflictId] = useState<string | null>(null)
  const [arrivedId, setArrivedId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [liveUpdateCount, setLiveUpdateCount] = useState(0)
  const [addingStaff, setAddingStaff] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [columnsOverflow, setColumnsOverflow] = useState(false)
  const online = useOnline()
  const canCreate = useCanBook() && online
  const canAddStaff = useCanManageStaff()
  const columnEls = useRef(new Map<string, HTMLDivElement>())
  const hiddenColumns = useMemo(() => hiddenColumnsFrom(params), [params])
  const dentistFilter = params.get(DENTIST_FILTER_PARAM) ?? "all"

  const activeAppointments = view === "week" ? weekAppointments : appointments
  const appointmentData = activeAppointments.data ?? NO_APPOINTMENTS
  const directoryPending = branches.isPending || dentists.isPending || chairsPending
  const schedulePending = activeAppointments.isPending || (view === "day" && shifts.isPending)
  const shiftsUnavailable = view === "day" && shifts.isError

  useEffect(() => {
    const appointmentId = params.get("a")
    if (!appointmentId || selected) return
    const linkedAppointment = appointmentData.find((appointment) => appointment.id === appointmentId)
    if (linkedAppointment) setSelected(linkedAppointment)
  }, [appointmentData, params, selected])

  useEffect(() => {
    if (params.get("new") !== "appointment" || !branchId || !canCreate || draft) return
    setDraft({ branchId })
  }, [branchId, canCreate, draft, params])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen(true)
        return
      }
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      if (typing || document.querySelector("[role=dialog]")) return
      event.preventDefault()
      setShortcutsOpen(true)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const lanePositions = useMemo(
    () => (view === "day" ? layoutByDentist(appointmentData) : new Map()),
    [view, appointmentData]
  )
  const allDentists = useMemo(() => dentists.data ?? [], [dentists.data])
  const allChairs = useMemo(() => chairs.data ?? [], [chairs.data])
  const branchDentists = useMemo(() => {
    if (view !== "day") return allDentists
    const rostered = new Set([
      ...(shifts.data ?? []).map((shift) => shift.staffId),
      ...appointmentData.map((appointment) => appointment.dentistId)
    ])
    return rostered.size === 0
      ? allDentists
      : allDentists.filter((dentist) => rostered.has(dentist.id))
  }, [view, allDentists, shifts.data, appointmentData])
  const branch = branches.data?.find((entry) => entry.id === branchId)
  const branchName = branch?.name
  const branchHours = useMemo(() => readOpeningHours(branch?.openingHours), [branch])
  const {
    mode: columnMode,
    setMode: setColumnMode,
    columns: resourceColumns,
    columnOf: resourceColumnOf
  } = useColumnMode({ dentists: branchDentists, chairs: allChairs })
  const emptyChairs = view === "day" && columnMode === "chair" && allChairs.length === 0
  const openHours = useMemo(
    () =>
      columnMode === "chair" && branchHours
        ? (isoDate: string) => openingSpans(branchHours, isoDate)
        : undefined,
    [columnMode, branchHours]
  )
  const dayLooksEmpty =
    view === "day" &&
    appointmentData.length === 0 &&
    !activeAppointments.isError &&
    !shiftsUnavailable
  const nobodyRostered = dayLooksEmpty && shifts.isSuccess && (shifts.data?.length ?? 0) === 0
  const openButUnbooked = dayLooksEmpty && !nobodyRostered

  const gridColumns = useMemo(() => {
    return mode === "sm" ? resourceColumns : resourceColumns.filter((c) => !hiddenColumns.has(c.id))
  }, [mode, resourceColumns, hiddenColumns])
  const columnOf = resourceColumnOf
  const selectedChairName = useMemo(() => {
    if (!selected) return undefined
    const chairId = selected.claims.find((claim) => claim.status === "active")?.resourceId
    return allChairs.find((chair) => chair.id === chairId)?.name
  }, [selected, allChairs])

  const columnMeta = useMemo(() => {
    if (view !== "day" || columnMode !== "dentist") return undefined
    return (column: TimelineColumn): ColumnMeta | undefined => {
      if (!column.staffId) return undefined
      return { hue: staffHue(column.staffId) }
    }
  }, [view, columnMode])

  const canDrag = canCreate && columnMode === "dentist" && view === "day"
  const dragColumnIds = useMemo(
    () => (canDrag ? gridColumns.map((c) => c.id) : []),
    [canDrag, gridColumns]
  )
  const unseated = useMemo(() => {
    if (view !== "day" || columnMode !== "chair" || allChairs.length === 0) return NO_APPOINTMENTS
    return appointmentData
      .filter((a) => a.status !== "cancelled" && resourceColumnOf(a) === null)
      .toSorted((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  }, [view, columnMode, allChairs, appointmentData, resourceColumnOf])
  const dayKey = useMemo(
    () =>
      view === "week"
        ? queryKeys.appointments.week(branchId, weekStart)
        : queryKeys.appointments.day(branchId, dayStart),
    [view, branchId, weekStart, dayStart]
  )

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
      setLiveUpdateCount((count) => count + 1)
      setAnnouncement("A new booking just arrived on this day")
    }
  })

  const keyboard = useGridKeyboard({ reschedule, isBusy: (id) => !canDrag || !online || isBusy(id) })

  const drag = useDragMove({
    dentistIds: dragColumnIds,
    columnLefts: () =>
      dragColumnIds.map((id) => columnEls.current.get(id)?.getBoundingClientRect().left ?? 0),
    isBusy,
    onDrop: reschedule
  })

  const preview = useMemo(() => {
    if (!drag.preview) return null
    const source = appointmentData.find((a) => a.id === drag.preview?.id)
    if (!source) return null
    return {
      ...source,
      dentistId: drag.preview.dentistId,
      startsAt: new Date(drag.preview.startMs).toISOString(),
      endsAt: new Date(drag.preview.endMs).toISOString()
    }
  }, [drag.preview, appointmentData])

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

  useEffect(() => {
    setLiveUpdateCount(0)
  }, [branchId, date, view])

  const onChange = (next: { date?: string; branchId?: string; view?: TimelineView }) => {
    const merged = new URLSearchParams(params)
    if (next.date) merged.set("d", next.date)
    if (next.branchId) merged.set("b", next.branchId)
    if (next.view) {
      if (next.view === "week") merged.set(VIEW_PARAM, "week")
      else merged.delete(VIEW_PARAM)
    }
    setParams(merged)
  }

  const onToggleColumn = (columnId: string) => {
    const next = new Set(hiddenColumns)
    if (next.has(columnId)) next.delete(columnId)
    else next.add(columnId)

    onSetHiddenColumns(next)
  }

  const onSetHiddenColumns = (next: ReadonlySet<string>) => {
    const merged = new URLSearchParams(params)
    if (next.size === 0) merged.delete(HIDDEN_COLUMNS_PARAM)
    else merged.set(HIDDEN_COLUMNS_PARAM, [...next].sort().join(","))
    setParams(merged)
  }

  const onDentistFilterChange = (next: string) => {
    const merged = new URLSearchParams(params)
    if (next === "all") merged.delete(DENTIST_FILTER_PARAM)
    else merged.set(DENTIST_FILTER_PARAM, next)
    setParams(merged)
  }

  const jumpToAppointment = (appointment: Appointment) => {
    const appointmentDate = bkkDate(Date.parse(appointment.startsAt))
    if (appointmentDate !== date || view !== "day") {
      onChange({ date: appointmentDate, view: "day" })
    }
    setArrivedId(appointment.id)
    setSelected(appointment)
  }

  if (directoryPending) {
    return (
      <div data-testid="timeline-loading" className="flex min-h-0 flex-1 flex-col gap-3 p-2 sm:p-3">
        <div
          data-testid="timeline-toolbar-skeleton"
          className="rounded-hero border border-border bg-card p-3 sm:p-4"
        >
          <Skeleton className="h-11 w-full sm:h-12" />
          <Skeleton className="mt-2 h-11 w-full" />
        </div>
        <div
          data-testid="timeline-grid-skeleton"
          className="min-h-0 flex-1 rounded-timeline-shell border border-border bg-timeline-shell p-2"
        >
          <Skeleton className="h-full min-h-96 w-full" />
        </div>
      </div>
    )
  }
  if (branches.isError || dentists.isError || (chairModeRequested && chairs.isError)) {
    return (
      <EmptyState
        icon={CalendarX}
        title="Could not load the clinic"
        hint="Check your connection, then try again."
        action={
          <Button
            onClick={() => {
  void branches.refetch()
  void dentists.refetch()
  if (chairModeRequested) void chairs.refetch()
            }}
          >
            Retry
          </Button>
        }
      />
    )
  }
  if (branches.data?.length === 0) {
    return <EmptyState icon={CalendarX} title="No branches yet" hint="Add a branch before building its schedule." />
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
                onClick={() => setAddingStaff(true)}
  disabled={!online}
  title={online ? undefined : OFFLINE_MESSAGE}
  aria-describedby={online ? undefined : OFFLINE_REASON_ID}
            >
  Add a colleague
            </Button>
            {online ? null : (
  <p id={OFFLINE_REASON_ID} className="type-ui font-medium text-destructive">
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
    <div data-testid="timeline-page" className="flex min-h-0 flex-1 flex-col">
      <TimelineToolbar
        date={date}
        branchId={branchId}
        branches={branches.data}
        view={view}
        onChange={onChange}
        onSearch={() => setPaletteOpen(true)}
        showViewToggle={mode !== "sm"}
        primaryAction={
          <Button
            size="sm"
            disabled={!canCreate || branchId === undefined}
            title={!online ? OFFLINE_MESSAGE : undefined}
            onClick={() =>
  branchId !== undefined && branchDentists[0]
    ? setDraft({ branchId })
    : undefined
            }
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New appointment
          </Button>
        }
      >
        {view === "day" && mode !== "sm" ? (
          <SegmentedControl
            ariaLabel="Column grouping"
            descriptionId={columnMode === "chair" ? "chair-layout-description" : undefined}
            value={columnMode}
            onValueChange={(next) => setColumnMode(next === "chair" ? "chair" : "dentist")}
            options={[
  { value: "dentist", label: "Dentists" },
  {
    value: "chair",
    ariaLabel: "Chairs",
    label: (
      <span className="flex items-center gap-1.5">
        Chairs
        <Lock
          data-testid="chair-read-only"
          className="h-3 w-3 shrink-0"
          aria-hidden="true"
        />
      </span>
    )
  }
            ]}
          />
        ) : null}
        {view === "day" && mode !== "sm" && columnMode === "chair" ? (
          <p id="chair-layout-description" className="sr-only">
            Chair layout is read-only. Open an appointment to move it.
          </p>
        ) : null}
        {mode === "sm" ? null : <ServiceLegend appointments={appointmentData} />}
        {view === "day" &&
        mode !== "sm" &&
        (mode === "md" || columnsOverflow || hiddenColumns.size > 0) ? (
          <ColumnPicker
            columns={resourceColumns}
            hidden={hiddenColumns}
            onToggle={onToggleColumn}
            onSetHidden={onSetHiddenColumns}
          />
        ) : null}
      </TimelineToolbar>
      {unknownBranch ? (
        <div className="px-4 pt-2">
          <StatusCallout tone="warning" icon={TriangleAlert} title="That branch is not available">
            {`This link points at a branch you cannot open. Showing ${branchName ?? "another branch"} instead.`}
          </StatusCallout>
        </div>
      ) : null}
      <UnseatedNotice appointments={unseated} onGroupByDentist={() => setColumnMode("dentist")} />
      {canDrag && mode !== "sm" ? (
        <p id="timeline-interaction-hint" className="sr-only">
          Press question mark for keyboard shortcuts.
        </p>
      ) : null}
      {liveUpdateCount > 0 ? (
        <div
          role="status"
          aria-label="Live schedule update"
          className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-4 py-2 type-ui text-primary-on-surface"
        >
          <p>
            <span className="font-semibold">
  {liveUpdateCount} new appointment{liveUpdateCount === 1 ? "" : "s"}
            </span>{" "}
            added to {view === "week" ? `the week of ${fmtScheduleDay(weekStart)}` : fmtScheduleDay(date)}.
          </p>
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-control px-2 type-ui font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setLiveUpdateCount(0)}
          >
            Review updates
          </button>
        </div>
      ) : null}
      {activeAppointments.isError || shiftsUnavailable ? (
        <div className="px-4 pt-2">
          <StatusCallout
            tone="warning"
            icon={TriangleAlert}
            title={
  activeAppointments.isError
    ? "This schedule may be incomplete"
    : "Shift shading is unavailable"
            }
          >
            <button
  type="button"
  data-testid="schedule-retry"
  className="rounded-control px-1 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  onClick={() => {
    if (activeAppointments.isError) void activeAppointments.refetch()
    if (shiftsUnavailable) void shifts.refetch()
  }}
            >
  Retry
            </button>
          </StatusCallout>
        </div>
      ) : null}
      {schedulePending ? (
        <ScheduleLoading />
      ) : emptyChairs ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          <EmptyState
            icon={CalendarX}
            title="No chairs at this branch"
            hint="Add a chair in Settings before using chair view."
          />
        </div>
      ) : mode === "sm" ? (
        <AgendaView
          appointments={appointmentData}
          dentists={allDentists}
          date={date}
          dentistFilter={dentistFilter}
          onDentistFilterChange={onDentistFilterChange}
          conflictId={conflictId}
          onOpen={setSelected}
        />
      ) : view === "week" ? (
        <WeeklyAgendaBoard
          weekStart={weekStart}
          appointments={appointmentData}
          dentists={allDentists}
          onOpen={setSelected}
        />
      ) : (
        <div className="contents" onKeyDown={keyboard.onKeyDown}>
          <TimeGrid
            date={date}
            columns={gridColumns}
            columnOf={columnOf}
            resourceKind={columnMode}
            resourceContext={columnMode === "chair" ? branchName : undefined}
            columnMeta={columnMeta}
            snap={mode === "md"}
            showOffShift={!shiftsUnavailable}
            openHours={openHours}
            shifts={shifts.data ?? []}
            appointments={appointmentData}
            columnRef={(id, element) => {
  if (element) columnEls.current.set(id, element)
  else columnEls.current.delete(id)
            }}
            onColumnsOverflow={setColumnsOverflow}
            emptyNotice={
  nobodyRostered ? (
    <div data-testid="nobody-rostered">
      <p className="type-ui font-semibold text-foreground">
        Nobody is on shift on {fmtScheduleDay(date)}
      </p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() =>
          navigate(`/app/roster?w=${weekStart}${branchId ? `&b=${branchId}` : ""}`)
        }
      >
        Open Roster
      </Button>
    </div>
  ) : openButUnbooked ? (
    <div data-testid="nothing-booked">
      <p className="type-ui font-semibold text-foreground">Nothing booked yet</p>
      {canCreate && branchId !== undefined ? (
        <Button
          size="sm"
          className="mt-2"
          onClick={() => setDraft({ branchId })}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New appointment
        </Button>
      ) : (
        <p className="mt-0.5 type-supporting text-muted-foreground">
          This day is open but has no appointments.
        </p>
      )}
    </div>
  ) : undefined
            }
            renderAppointment={(a, ds) => (
  <AppointmentCard
    key={a.id}
    appointment={a}
    dentistName={allDentists.find((dentist) => dentist.id === a.dentistId)?.name}
    dayStart={ds}
    lane={lanePositions.get(a.id)?.lane ?? 0}
    lanes={lanePositions.get(a.id)?.lanes ?? 1}
    interactionHintId={canDrag ? "timeline-interaction-hint" : undefined}
    onClick={(picked) => {
      if (!drag.consumeDrag()) setSelected(picked)
    }}
    onMoveStart={canDrag ? drag.startMove(a) : undefined}
    onResizeStart={canDrag ? drag.startResize(a) : undefined}
    dimmed={drag.preview?.id === a.id}
    conflict={conflictId === a.id}
    arrived={arrivedId === a.id}
    selected={selected?.id === a.id}
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
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        appointments={appointmentData}
        dentists={allDentists}
        chairs={allChairs}
        scope={view}
        scopeLabel={`${branchName ?? "Selected branch"} · ${view === "week" ? `Week of ${fmtScheduleDay(weekStart)}` : fmtScheduleDay(date)} · ${appointmentData.length} ${appointmentData.length === 1 ? "appointment" : "appointments"}`}
        onSelect={jumpToAppointment}
        onShowShortcuts={() => setShortcutsOpen(true)}
      />
      <KeyboardShortcuts
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        searchShortcut={searchShortcutLabel()}
        canMove={canDrag && online}
      />
      <AppointmentDrawer
        appointment={selected}
        dentists={allDentists}
        chairName={selectedChairName}
        branchName={branchName}
        onClose={() => {
          setSelected(null)
          const merged = new URLSearchParams(params)
          merged.delete("a")
          setParams(merged, { replace: true })
        }}
        onReschedule={reschedule}
        onBookFollowUp={(appointment) => {
          if (branchId === undefined) return
          setSelected(null)
          const merged = new URLSearchParams(params)
          merged.delete("a")
          merged.set("p", appointment.patientId)
          setParams(merged, { replace: true })
          setDraft({
            branchId,
            dentist: allDentists.find((dentist) => dentist.id === appointment.dentistId)
          })
        }}
      />
      {draft ? (
        <CreateDrawer
          draft={draft}
          dentists={branchDentists}
          dayStart={dayStart}
          branchName={branchName}
          initialPatientId={params.get("p") ?? undefined}
          onClose={() => {
            setDraft(null)
            const merged = new URLSearchParams(params)
            merged.delete("new")
            merged.delete("p")
            setParams(merged, { replace: true })
          }}
        />
      ) : null}
    </div>
  )
}
