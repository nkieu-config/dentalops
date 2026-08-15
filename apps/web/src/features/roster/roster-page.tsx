import { shiftSchema, type DraftShift, type Shift, type Violation } from "@dentalops/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarX, ChevronLeft, ChevronRight, Plus, TriangleAlert } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useSearchParams } from "react-router"
import { toast } from "sonner"
import { z } from "zod"
import { Button } from "../../components/ui/button"
import { PageTitle } from "../../components/ui/page-header"
import { EmptyState } from "../../components/ui/empty-state"
import { DatePicker } from "../../components/ui/date-picker"
import { AppSelect } from "../../components/ui/app-select"
import { Sheet } from "../../components/ui/sheet"
import { Skeleton } from "../../components/ui/skeleton"
import { StatusCallout } from "../../components/ui/status-callout"
import { api, ApiError } from "../../lib/api"
import { useCanManageRoster } from "../../lib/session"
import { useMediaQuery } from "../../lib/use-media-query"
import { useOnline } from "../../lib/use-online"
import { useBranches, useDentists } from "../timeline/hooks"
import { bkkDate, bkkShiftDate, bkkToday, fmtCompactDay, fmtScheduleDay } from "../timeline/lib/geometry"
import {
  bkkWeekStart,
  draftForStaff,
  fmtWeekday,
  shiftFormInterval,
  shiftToForm,
  weekDates,
  weekShiftsKey,
  weekWindow,
  useRosterValidation,
  useWeekAppointments,
  useWeekShifts,
  type ShiftForm,
  type ValidateRequest
} from "./hooks"
import { RosterList } from "./roster-list"
import { ShiftBlock } from "./shift-block"
import { ShiftDialog } from "./shift-dialog"
import { useShiftDrag, type ShiftDraft } from "./use-shift-drag"
import { ViolationList, type ViolationLink } from "./violation-list"
import { queryKeys } from "../../lib/query-keys"
import { UNDO_MS } from "../../lib/undo"

const MD_WINDOW_DAYS = 3

type RosterMode = "sm" | "md" | "lg"

const useRosterMode = (): RosterMode => {
  const isSmall = useMediaQuery("(max-width: 767px)")
  const isMedium = useMediaQuery("(min-width: 768px) and (max-width: 1279px)")
  if (isSmall) return "sm"
  return isMedium ? "md" : "lg"
}

export const RosterPage = () => {
  const [params, setParams] = useSearchParams()
  const branches = useBranches()
  const dentists = useDentists()
  const branchId = params.get("b") ?? branches.data?.[0]?.id
  const weekStart = bkkWeekStart(params.get("w") ?? bkkToday())
  const shifts = useWeekShifts(branchId, weekStart)
  const appointments = useWeekAppointments(branchId, weekStart)
  const [form, setForm] = useState<ShiftForm | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dayOffset, setDayOffset] = useState(0)
  const [dropped, setDropped] = useState<ShiftDraft | null>(null)
  const moveRef = useRef<(draft: ShiftDraft) => void>(() => {})
  const mode = useRosterMode()
  const online = useOnline()
  const queryClient = useQueryClient()
  const dayEls = useRef(new Map<string, HTMLElement>())

  const staff = useMemo(() => dentists.data ?? [], [dentists.data])
  const weekShifts = useMemo(() => shifts.data ?? [], [shifts.data])
  const dates = useMemo(() => weekDates(weekStart), [weekStart])
  const today = bkkToday()
  const branchName = branches.data?.find((branch) => branch.id === branchId)?.name ?? "selected branch"
  const isScheduleRefreshing = shifts.isFetching || appointments.isFetching
  const visibleDates = useMemo(
    () => (mode === "md" ? dates.slice(dayOffset, dayOffset + MD_WINDOW_DAYS) : dates),
    [mode, dates, dayOffset]
  )

  const shiftsKey = weekShiftsKey(branchId, weekStart)

  const invalidate = () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.shifts.root() })
    void queryClient.invalidateQueries({ queryKey: queryKeys.rosterValidation.root() })
  }

  const move = useMutation({
    mutationFn: (draft: ShiftDraft) =>
      api(`/shifts/${draft.shiftId}`, shiftSchema, {
        method: "PATCH",
        body: { startsAt: draft.startsAt, endsAt: draft.endsAt }
      }),
    onMutate: async (draft) => {
      await queryClient.cancelQueries({ queryKey: shiftsKey })
      const previous = queryClient.getQueryData<Shift[]>(shiftsKey)
      if (previous) {
        queryClient.setQueryData(
          shiftsKey,
          previous.map((entry) =>
            entry.id === draft.shiftId
  ? { ...entry, startsAt: draft.startsAt, endsAt: draft.endsAt }
  : entry
          )
        )
      }
      setDropped(null)
      return { previous }
    },
    onError: (error, _draft, context) => {
      if (context?.previous) queryClient.setQueryData(shiftsKey, context.previous)
      toast.error(error instanceof ApiError ? error.message : "Could not move the shift")
    },
    onSuccess: (updated, draft, context) => {
      const before = context?.previous?.find((entry) => entry.id === draft.shiftId)
      if (!before || before.startsAt === updated.startsAt) {
        toast.success("Shift moved")
        return
      }
      toast.success(`Moved to ${fmtWeekday(bkkDate(Date.parse(updated.startsAt)))}`, {
        id: `shift-moved-${updated.id}`,
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () =>
            moveRef.current({
  shiftId: before.id,
  staffId: before.staffId,
  startsAt: before.startsAt,
  endsAt: before.endsAt
            })
        }
      })
    },
    onSettled: () => invalidate()
  })

  moveRef.current = move.mutate

  const drag = useShiftDrag({
    dates: visibleDates,
    columnLefts: () =>
      visibleDates.map((date) => dayEls.current.get(date)?.getBoundingClientRect().left ?? 0),
    isBusy: (shiftId) =>
      dropped !== null || (move.isPending && move.variables?.shiftId === shiftId),
    onDrop: setDropped
  })

  const moving = drag.preview ?? dropped

  const draftShifts = useMemo<DraftShift[] | null>(() => {
    if (moving) {
      const edited: DraftShift = {
        id: moving.shiftId,
        staffId: moving.staffId,
        startsAt: moving.startsAt,
        endsAt: moving.endsAt
      }
      return draftForStaff(weekShifts, moving.staffId, edited, moving.shiftId)
    }
    if (!form) return null
    const interval = shiftFormInterval(form)
    return draftForStaff(
      weekShifts,
      form.staffId,
      interval ? { id: form.shiftId, staffId: form.staffId, ...interval } : null,
      form.shiftId
    )
  }, [moving, form, weekShifts])

  const request = useMemo<ValidateRequest | null>(
    () =>
      branchId
        ? { branchId, ...weekWindow(weekStart), draftShifts: draftShifts ?? [] }
        : null,
    [branchId, weekStart, draftShifts]
  )

  const validation = useRosterValidation(request)
  const conflictingShiftIds = useMemo(() => {
    const affectedCells = new Set<string>()
    const scheduledAppointments = appointments.data ?? []
    for (const violation of validation.blocking) {
      for (const appointmentId of violation.appointmentIds ?? []) {
        const appointment = scheduledAppointments.find((item) => item.id === appointmentId)
        if (appointment) {
          affectedCells.add(`${violation.staffId}|${bkkDate(Date.parse(appointment.startsAt))}`)
        }
      }
    }
    return new Set(
      weekShifts
        .filter((shift) => affectedCells.has(`${shift.staffId}|${bkkDate(Date.parse(shift.startsAt))}`))
        .map((shift) => shift.id)
    )
  }, [appointments.data, validation.blocking, weekShifts])

  const shiftsByCell = useMemo(() => {
    const map = new Map<string, Shift[]>()
    for (const saved of weekShifts) {
      const shift =
        moving && moving.shiftId === saved.id
          ? { ...saved, startsAt: moving.startsAt, endsAt: moving.endsAt }
          : saved
      const key = `${shift.staffId}|${bkkDate(Date.parse(shift.startsAt))}`
      map.set(key, [...(map.get(key) ?? []), shift])
    }
    return map
  }, [weekShifts, moving])

  const shiftsOn = (staffId: string, date: string) => shiftsByCell.get(`${staffId}|${date}`) ?? []

  const staffName = (staffId: string) =>
    staff.find((member) => member.id === staffId)?.name ?? "Unknown staff"

  const linkFor = (violation: Violation): ViolationLink | null => {
    const ids = violation.appointmentIds ?? []
    if (ids.length === 0 || branchId === undefined) return null
    const affected = (appointments.data ?? []).find((appointment) => ids.includes(appointment.id))
    if (!affected) return null
    return {
      href: `/app/timeline?d=${bkkDate(Date.parse(affected.startsAt))}&b=${branchId}`,
      label: ids.length === 1 ? "View the appointment" : `View ${ids.length} appointments`
    }
  }

  const save = useMutation({
    mutationFn: async (pending: ShiftForm) => {
      const interval = shiftFormInterval(pending)
      if (!interval || branchId === undefined) return
      if (pending.shiftId) {
        await api(`/shifts/${pending.shiftId}`, shiftSchema, { method: "PATCH", body: interval })
        return
      }
      await api("/shifts", shiftSchema, {
        method: "POST",
        body: { staffId: pending.staffId, branchId, ...interval }
      })
    },
    onSuccess: () => {
      invalidate()
      setForm(null)
      toast.success("Roster saved")
    },
    onError: (error) => {
      invalidate()
      toast.error(error instanceof ApiError ? error.message : "Could not save the shift")
    }
  })

  const remove = useMutation({
    mutationFn: (shiftId: string) => api(`/shifts/${shiftId}`, z.void(), { method: "DELETE" }),
    onSuccess: () => {
      invalidate()
      setForm(null)
      toast.success("Shift removed")
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Could not remove the shift")
    }
  })

  useEffect(() => {
    if (dropped === null || validation.isSettling) return
    if (validation.isError) {
      setDropped(null)
      toast.error("Could not check this move for conflicts — try again")
      return
    }
    const blocker = validation.blocking[0]
    if (blocker) {
      setDropped(null)
      toast.error(`Cannot move that shift — ${blocker.detail}`)
      return
    }
    move.mutate(dropped)
  }, [dropped, validation.isSettling, validation.isError, validation.blocking, move])

  const shiftWeek = (weeks: number) => {
    const merged = new URLSearchParams(params)
    merged.set("w", bkkShiftDate(weekStart, weeks * 7))
    setParams(merged)
    setDayOffset(0)
  }

  const pickWeek = (isoDate: string) => {
    const merged = new URLSearchParams(params)
    merged.set("w", bkkWeekStart(isoDate))
    setParams(merged)
  }

  const goToday = () => {
    const merged = new URLSearchParams(params)
    merged.set("w", bkkWeekStart(bkkToday()))
    setParams(merged)
    setDayOffset(0)
  }

  const pickBranch = (next: string) => {
    const merged = new URLSearchParams(params)
    merged.set("b", next)
    setParams(merged)
  }

  const openNewShift = (staffId = "", date = "") => {
    setForm({ staffId, date, start: "09:00", end: "17:00" })
  }

  const panel = validation.isError ? (
    <StatusCallout tone="warning" icon={TriangleAlert} title="Could not check coverage">
      Scheduling conflicts and gaps could not be checked. Shift saves are paused until this
      succeeds again.
    </StatusCallout>
  ) : (
    <ViolationList
      violations={validation.violations}
      staffName={staffName}
      linkFor={linkFor}
    />
  )

  const summary = validation.isError
    ? "could not check"
    : validation.blocking.length > 0
      ? `${validation.blocking.length} blocking`
      : validation.violations.length > 0
        ? `${validation.violations.length} warnings`
        : "no violations"

  const hasReviewItems = validation.isError || validation.violations.length > 0
  const weekEnd = dates.at(-1) ?? weekStart
  const weekRangeLabel = `Week of ${fmtScheduleDay(weekStart)} to ${fmtScheduleDay(weekEnd)}`

  if (branches.isPending || dentists.isPending) {
    return (
      <div
        data-testid="roster-loading"
        aria-busy="true"
        aria-label="Loading roster"
        className="flex min-h-0 flex-1 flex-col gap-2 p-2 sm:gap-3 sm:p-3"
      >
        <Skeleton className="h-20 w-full rounded-hero" />
        <Skeleton className="min-h-72 w-full flex-1 rounded-timeline-shell" />
      </div>
    )
  }
  if (branches.isError || dentists.isError) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <EmptyState icon={CalendarX} title="Could not load the clinic" hint="Retry shortly" />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="shrink-0 p-2 pb-0 sm:p-3 sm:pb-0">
      <div
        data-testid="roster-command-surface"
        className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-hero border border-border bg-card px-4 py-4 shadow-xs md:grid-cols-[minmax(0,1fr)_auto] md:px-5 md:py-3 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-center">
        <div data-testid="roster-title" className="min-w-0">
          <PageTitle>Roster</PageTitle>
        </div>
        <div className="flex items-center gap-2 justify-self-start md:justify-self-end" role="group" aria-label="Week controls">
          <div className="flex min-h-11 items-center rounded-control border border-border bg-surface-subtle sm:min-h-9">
            <Button
  variant="ghost"
  size="icon"
  className="rounded-r-none"
  aria-label="Previous week"
  onClick={() => shiftWeek(-1)}
            >
  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <DatePicker
  date={weekStart}
  onChange={pickWeek}
  label={weekRangeLabel}
  triggerLabel={`Week of ${fmtScheduleDay(weekStart)}`}
  compactTriggerLabel={fmtCompactDay(weekStart)}
  className="min-w-40 rounded-none border-x border-border"
            />
            <Button
  variant="ghost"
  size="icon"
  className="rounded-l-none"
  aria-label="Next week"
  onClick={() => shiftWeek(1)}
            >
  <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <Button variant="secondary" size="sm"  onClick={goToday}>
            Today
          </Button>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 md:col-span-2 md:grid-cols-[minmax(0,1fr)_auto] xl:col-span-1 xl:grid-cols-[auto_auto]">
          <div data-testid="branch-field" className="min-w-0">
            <div className="flex min-h-11 items-center gap-2 sm:min-h-9">
  <AppSelect
    variant="toolbar"
    id="roster-branch"
    className="min-w-0 flex-1 sm:w-52 sm:flex-none"
    value={branchId ?? ""}
    aria-label={`Branch: ${branchName}`}
    onValueChange={pickBranch}
    options={(branches.data ?? []).map((branch) => ({ value: branch.id, label: branch.name }))}
  />
            </div>
            {isScheduleRefreshing ? (
  <p role="status" className="mt-1 type-meta text-muted-foreground">
    Loading {branchName} schedule…
  </p>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_auto] md:justify-self-end">
            {hasReviewItems && mode !== "lg" ? (
  <Button
    variant="secondary"
    className="order-2 sm:order-1"
    onClick={() => setSheetOpen(true)}
    data-testid="coverage-health"
  >
    Review
    <span className="tabular-nums">({summary})</span>
  </Button>
            ) : null}
            <Button className="order-1 w-full sm:order-2 sm:w-auto" onClick={() => openNewShift()}>
  <Plus className="h-4 w-4" aria-hidden="true" />
  Add shift
            </Button>
          </div>
        </div>
      </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-2 p-2 sm:gap-3 sm:p-3">
        {mode === "sm" ? (
          <RosterList
            staff={staff}
            dates={dates}
            shiftsOn={shiftsOn}
            conflictingShiftIds={conflictingShiftIds}
            onEdit={(shift) => setForm(shiftToForm(shift))}
            onAdd={(staffId) => openNewShift(staffId)}
          />
        ) : (
          <div
            className="min-h-0 min-w-0 flex-1 overflow-auto rounded-timeline-shell border border-border bg-card"
            data-testid="roster-grid"
          >
            {mode === "md" ? (
  <div className="flex items-center gap-2 border-b border-border px-2 py-1">
    <Button
      variant="ghost"
      size="sm"
                        aria-label="Earlier days"
      disabled={dayOffset === 0}
      onClick={() => setDayOffset((current) => Math.max(current - 1, 0))}
    >
      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
    </Button>
    <Button
      variant="ghost"
      size="sm"
                        aria-label="Later days"
      disabled={dayOffset >= dates.length - MD_WINDOW_DAYS}
      onClick={() =>
        setDayOffset((current) =>
          Math.min(current + 1, dates.length - MD_WINDOW_DAYS)
        )
      }
    >
      <ChevronRight className="h-4 w-4" aria-hidden="true" />
    </Button>
    <span data-testid="visible-date-window" className="type-meta font-medium tabular-nums text-muted-foreground">
      Showing {fmtWeekday(visibleDates[0] ?? weekStart)} - {fmtWeekday(visibleDates.at(-1) ?? weekStart)}
    </span>
  </div>
            ) : null}
            <div className="sticky top-0 z-10 flex border-b border-timeline-resource-line bg-timeline-header">
  <div className="sticky left-0 z-20 w-rostername shrink-0 border-r border-timeline-resource-line bg-timeline-header px-2 py-1.5 type-meta font-semibold uppercase tracking-wide text-muted-foreground">Dentists</div>
  {visibleDates.map((date) => (
    <div
      key={date}
      data-testid={`day-${date}`}
      ref={(element) => {
        if (element) dayEls.current.set(date, element)
        else dayEls.current.delete(date)
      }}
      data-today={date === today ? "true" : undefined}
      className={`min-w-rosterday flex-1 border-l border-timeline-resource-line px-2 py-1.5 type-meta font-semibold uppercase tracking-wide tabular-nums ${date === today ? "bg-primary-surface text-primary-on-surface" : "text-muted-foreground"}`}
    >
      {fmtWeekday(date)}
    </div>
  ))}
            </div>
            {staff.map((member) => (
  <div key={member.id} className="flex border-b border-timeline-resource-line">
    <div className="sticky left-0 z-10 w-rostername shrink-0 truncate border-r border-timeline-resource-line bg-card px-2 py-2 type-ui">{member.name}</div>
    {visibleDates.map((date) => {
      const cellShifts = shiftsOn(member.id, date)
      const empty = cellShifts.length === 0
      const cellClassName = "min-w-rosterday flex min-h-11 flex-1 flex-col gap-1 border-l border-timeline-resource-line p-1"
      return empty ? (
        <button
          key={date}
          type="button"
          data-testid={`cell-${member.id}-${date}`}
          aria-label={`Add shift for ${member.name} on ${fmtWeekday(date)}`}
          className={`${cellClassName} items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
          onClick={() => openNewShift(member.id, date)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : (
        <div
          key={date}
          data-testid={`cell-${member.id}-${date}`}
          className={cellClassName}
        >
          {cellShifts.map((shift) => (
            <ShiftBlock
              key={shift.id}
              shift={shift}
              staffName={member.name}
              onEdit={(picked) => {
                if (!drag.consumeDrag()) setForm(shiftToForm(picked))
              }}
              onMoveStart={online ? drag.startMove(shift, date) : undefined}
              conflicting={conflictingShiftIds.has(shift.id)}
              dragging={moving?.shiftId === shift.id}
            />
          ))}
        </div>
      )
    })}
  </div>
            ))}
          </div>
        )}
        {mode === "lg" && hasReviewItems ? (
          <aside
            aria-label="Validation"
            data-testid="violations-panel"
            className="w-80 shrink-0 overflow-y-auto rounded-timeline-shell border border-border bg-surface-subtle p-6"
          >
            <h2 className="type-body font-semibold">Review queue</h2>
            <p className="mb-3 type-ui text-muted-foreground">Review coverage issues and affected appointments.</p>
            {panel}
          </aside>
        ) : null}
      </div>

      {mode === "lg" ? null : (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} side="bottom" title="Validation">
          <div data-testid="violations-sheet">{panel}</div>
        </Sheet>
      )}

      <ShiftDialog
        value={form}
        staff={staff}
        violations={validation.violations}
        blocked={validation.blocking.length > 0 || validation.isError}
        error={validation.isError}
        settling={validation.isSettling}
        saving={save.isPending || remove.isPending}
        offline={!online}
        staffName={staffName}
        linkFor={linkFor}
        onChange={setForm}
        onSave={() => {
          if (form) save.mutate(form)
        }}
        onDelete={async () => {
          if (!form?.shiftId) return
          await remove.mutateAsync(form.shiftId)
        }}
        onClose={() => setForm(null)}
      />
    </div>
  )
}

export const RosterRoute = () =>
  useCanManageRoster() ? <RosterPage /> : <Navigate to="/app/timeline" replace />
