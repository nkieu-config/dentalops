import {
  appointmentSchema,
  branchSchema,
  resourceSchema,
  serviceSummarySchema,
  shiftSchema,
  staffMemberSchema
} from "@dentalops/contracts"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { z } from "zod"
import { api } from "../../lib/api"
import { DAY_MS, WEEK_DAYS, bkkDayStart } from "./lib/geometry"

export const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export const useBranches = () =>
  useQuery({ queryKey: ["branches"], queryFn: () => api("/branches", z.array(branchSchema)) })

export const useDentists = () =>
  useQuery({
    queryKey: ["staff", "dentist"],
    queryFn: () => api("/staff", z.array(staffMemberSchema), { query: { role: "dentist" } }),
    select: (staff) => staff.filter((s) => s.isActive)
  })

export const useServices = () =>
  useQuery({
    queryKey: ["services"],
    queryFn: () => api("/services", z.array(serviceSummarySchema)),
    select: (services) => services.filter((s) => s.isActive)
  })

export const useChairs = (branchId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ["resources", branchId, "chair"],
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
    queryKey: ["shifts", branchId, dayStart],
    enabled: enabled && branchId !== undefined,
    queryFn: () =>
      api("/shifts", z.array(shiftSchema), { query: { branchId, ...dayQuery(dayStart) } })
  })

export const useAppointments = (branchId: string | undefined, dayStart: number, enabled = true) =>
  useQuery({
    queryKey: ["appointments", branchId, dayStart],
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
    queryKey: ["shifts", branchId, "week", weekStart],
    enabled: enabled && branchId !== undefined,
    queryFn: () =>
      api("/shifts", z.array(shiftSchema), { query: { branchId, ...weekQuery(weekStart) } })
  })

export const useWeekAppointments = (branchId: string | undefined, weekStart: string, enabled = true) =>
  useQuery({
    queryKey: ["appointments", branchId, "week", weekStart],
    enabled: enabled && branchId !== undefined,
    queryFn: () =>
      api("/appointments", z.array(appointmentSchema), {
        query: { branchId, ...weekQuery(weekStart) }
      })
  })
