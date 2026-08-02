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
import { DAY_MS } from "./lib/geometry"

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

export const useShifts = (branchId: string | undefined, dayStart: number) =>
  useQuery({
    queryKey: ["shifts", branchId, dayStart],
    enabled: branchId !== undefined,
    queryFn: () =>
      api("/shifts", z.array(shiftSchema), { query: { branchId, ...dayQuery(dayStart) } })
  })

export const useAppointments = (branchId: string | undefined, dayStart: number) =>
  useQuery({
    queryKey: ["appointments", branchId, dayStart],
    enabled: branchId !== undefined,
    queryFn: () =>
      api("/appointments", z.array(appointmentSchema), {
        query: { branchId, ...dayQuery(dayStart) }
      })
  })
