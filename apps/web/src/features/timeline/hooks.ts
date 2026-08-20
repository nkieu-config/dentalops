import {
  appointmentSchema,
  branchSettingsSchema,
  resourceSchema,
  serviceSummarySchema,
  shiftSchema,
  staffMemberSchema
} from "@dentalops/contracts"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"
import { api } from "../../lib/api"
import { nowMs } from "../../lib/clock"
import { queryKeys } from "../../lib/query-keys"
import { DAY_MS, WEEK_DAYS, bkkDayStart } from "./lib/geometry"

export const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => nowMs())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(nowMs()), 60_000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export const useBranches = () =>
  useQuery({
    queryKey: queryKeys.branches(),
    queryFn: () => api("/branches", z.array(branchSettingsSchema))
  })

const onlyActive = <T extends { isActive: boolean }>(rows: T[]): T[] =>
  rows.filter((row) => row.isActive)

export const useDentists = () =>
  useQuery({
    queryKey: queryKeys.staff.byRole("dentist"),
    queryFn: () => api("/staff", z.array(staffMemberSchema), { query: { role: "dentist" } }),
    select: onlyActive
  })

export const useStaff = () =>
  useQuery({
    queryKey: queryKeys.staff.all(),
    queryFn: () => api("/staff", z.array(staffMemberSchema))
  })

export const useServices = () =>
  useQuery({
    queryKey: queryKeys.services(),
    queryFn: () => api("/services", z.array(serviceSummarySchema)),
    select: onlyActive
  })

export const useChairs = (branchId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.resources.chairs(branchId),
    enabled: enabled && branchId !== undefined,
    queryFn: () =>
      api("/resources", z.array(resourceSchema), { query: { branchId, type: "chair" } })
  })

const dayQuery = (dayStart: number) => ({
  from: new Date(dayStart).toISOString(),
  to: new Date(dayStart + DAY_MS).toISOString()
})

export const useShifts = (branchId: string | undefined, dayStart: number, enabled = true) =>
  useQuery({
    queryKey: queryKeys.shifts.day(branchId, dayStart),
    enabled: enabled && branchId !== undefined,
    queryFn: () =>
      api("/shifts", z.array(shiftSchema), { query: { branchId, ...dayQuery(dayStart) } })
  })

export const useAppointments = (branchId: string | undefined, dayStart: number, enabled = true) =>
  useQuery({
    queryKey: queryKeys.appointments.day(branchId, dayStart),
    enabled: enabled && branchId !== undefined,
    queryFn: () =>
      api("/appointments", z.array(appointmentSchema), {
        query: { branchId, ...dayQuery(dayStart) }
      })
  })

const weekQuery = (weekStart: string) => {
  const start = bkkDayStart(weekStart)
  return { from: new Date(start).toISOString(), to: new Date(start + WEEK_DAYS * DAY_MS).toISOString() }
}

export const useWeekShifts = (branchId: string | undefined, weekStart: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.shifts.week(branchId, weekStart),
    enabled: enabled && branchId !== undefined,
    queryFn: () =>
      api("/shifts", z.array(shiftSchema), { query: { branchId, ...weekQuery(weekStart) } })
  })

export const useWeekAppointments = (branchId: string | undefined, weekStart: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.appointments.week(branchId, weekStart),
    enabled: enabled && branchId !== undefined,
    queryFn: () =>
      api("/appointments", z.array(appointmentSchema), {
        query: { branchId, ...weekQuery(weekStart) }
      })
  })
