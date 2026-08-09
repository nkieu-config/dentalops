import { shiftSchema, type DraftShift, type Shift, type Violation } from "@dentalops/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { CalendarX, ChevronLeft, ChevronRight, Plus, TriangleAlert } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Navigate, useSearchParams } from "react-router"
import { toast } from "sonner"
import { z } from "zod"
import { Badge } from "../../components/ui/badge"
import { Button } from "../../components/ui/button"
import { EmptyState } from "../../components/ui/empty-state"
import { NativeSelect } from "../../components/ui/native-select"
import { Sheet } from "../../components/ui/sheet"
import { Skeleton } from "../../components/ui/skeleton"
import { StatusCallout } from "../../components/ui/status-callout"
import { api, ApiError } from "../../lib/api"
import { useCanManageRoster } from "../../lib/session"
import { useMediaQuery } from "../../lib/use-media-query"
import { useOnline } from "../../lib/use-online"
import { useBranches, useDentists } from "../timeline/hooks"
import { bkkDate, bkkShiftDate, bkkToday, fmtDay } from "../timeline/lib/geometry"
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

const MD_WINDOW_DAYS = 3

type RosterMode = "sm" | "md" | "lg"

const useRosterMode = (): RosterMode => {
  const isSmall = useMediaQuery("(max-width: 767px)")
  const isMedium = useMediaQuery("(min-width: 768px) and (max-width: 1023px)")
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
  const mode = useRosterMode()
  const online = useOnline()
  const queryClient = useQueryClient()
  const dayEls = useRef(new Map<string, HTMLElement>())

  const staff = useMemo(() => dentists.data ?? [], [dentists.data])
  const weekShifts = useMemo(() => shifts.data ?? [], [shifts.data])
  const dates = useMemo(() => weekDates(weekStart), [weekStart])
  const visibleDates = useMemo(
    () => (mode === "md" ? dates.slice(dayOffset, dayOffset + MD_WINDOW_DAYS) : dates),
    [mode, dates, dayOffset]
  )

  const shiftsKey = weekShiftsKey(branchId, weekStart)

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["roster-shifts"] })
    void queryClient.invalidateQueries({ queryKey: ["shifts"] })
    void queryClient.invalidateQueries({ queryKey: ["roster-validate"] })
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
      return { previous }
    },
    onError: (error, _draft, context) => {
      if (context?.previous) queryClient.setQueryData(shiftsKey, context.previous)
      toast.error(error instanceof ApiError ? error.message : "Could not move the shift")
    },
    onSuccess: () => toast.success("Shift moved"),
    onSettled: () => invalidate()
  })

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
  const blockedStaff = useMemo(
    () => new Set(validation.blocking.map((violation) => violation.staffId)),
    [validation.blocking]
  )

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
    setDropped(null)
    if (validation.isError) {
      toast.error("Could not check this move for conflicts — try again")
      return
    }
    const blocker = validation.blocking[0]
    if (blocker) {
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

  const coverageTone = validation.isError
    ? "warning"
    : validation.blocking.length > 0
      ? "destructive"
      : validation.violations.length > 0
        ? "warning"
        : "success"

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
    <div className="flex h-[calc(100dvh-var(--spacing-topbar))] min-w-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5 sm:gap-4 md:px-6 md:py-3">
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11"
          aria-label="Previous week"
          onClick={() => shiftWeek(-1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="text-sm font-medium tabular-nums">Week of {fmtDay(weekStart)}</span>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-11"
          aria-label="Next week"
          onClick={() => shiftWeek(1)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button variant="secondary" size="sm" className="min-h-11" onClick={goToday}>
          Today
        </Button>
        <NativeSelect
          aria-label="Branch"
          className="min-h-11 w-auto"
          value={branchId ?? ""}
          onChange={(e) => pickBranch(e.target.value)}
        >
          {(branches.data ?? []).map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </NativeSelect>
        <div className="flex-1" />
        {mode === "lg" ? (
          <Badge tone={coverageTone} data-testid="coverage-health">
            Coverage: {summary}
          </Badge>
        ) : (
          <Button variant="secondary" className="min-h-11" onClick={() => setSheetOpen(true)} data-testid="coverage-health">
            Validation
            <span className="tabular-nums">({summary})</span>
          </Button>
        )}
        <Button
          className="min-h-11"
          onClick={() =>
            setForm({
              staffId: staff[0]?.id ?? "",
              date: dates[0] ?? weekStart,
              start: "09:00",
              end: "17:00"
            })
          }
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add shift
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {mode === "sm" ? (
          <RosterList
            staff={staff}
            dates={dates}
            shiftsOn={shiftsOn}
            blockedStaff={blockedStaff}
            onEdit={(shift) => setForm(shiftToForm(shift))}
          />
        ) : (
          <div className="min-h-0 min-w-0 flex-1 overflow-auto" data-testid="roster-grid">
            {mode === "md" ? (
              <div className="flex items-center gap-2 border-b border-border px-2 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
                  aria-label="Earlier days"
                  disabled={dayOffset === 0}
                  onClick={() => setDayOffset((current) => Math.max(current - 1, 0))}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11"
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
              </div>
            ) : null}
            <div className="sticky top-0 z-10 flex border-b border-border bg-card">
              <div className="w-40 shrink-0 px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Staff</div>
              {visibleDates.map((date) => (
                <div
                  key={date}
                  data-testid={`day-${date}`}
                  ref={(element) => {
                    if (element) dayEls.current.set(date, element)
                    else dayEls.current.delete(date)
                  }}
                  className="flex-1 border-l border-border px-2 py-1.5 text-xs font-semibold uppercase tracking-wide tabular-nums text-muted-foreground"
                >
                  {fmtWeekday(date)}
                </div>
              ))}
            </div>
            {staff.map((member) => (
              <div key={member.id} className="flex border-b border-border">
                <div className="w-40 shrink-0 truncate px-2 py-2 text-sm">{member.name}</div>
                {visibleDates.map((date) => (
                  <div
                    key={date}
                    data-testid={`cell-${member.id}-${date}`}
                    className="flex flex-1 flex-col gap-1 border-l border-border p-1"
                  >
                    {shiftsOn(member.id, date).map((shift) => (
                      <ShiftBlock
                        key={shift.id}
                        shift={shift}
                        staffName={member.name}
                        onEdit={(picked) => {
                          if (!drag.consumeDrag()) setForm(shiftToForm(picked))
                        }}
                        onMoveStart={online ? drag.startMove(shift, date) : undefined}
                        conflicting={blockedStaff.has(member.id)}
                        dragging={moving?.shiftId === shift.id}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {mode === "lg" ? (
          <aside
            aria-label="Validation"
            data-testid="violations-panel"
            className="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface-subtle p-6"
          >
            <h2 className="mb-3 text-base font-semibold">Validation</h2>
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
        onDelete={() => {
          if (form?.shiftId) remove.mutate(form.shiftId)
        }}
        onClose={() => setForm(null)}
      />
    </div>
  )
}

export const RosterRoute = () =>
  useCanManageRoster() ? <RosterPage /> : <Navigate to="/app/timeline" replace />
