import {
  availabilityResponseSchema,
  publicAppointmentSchema,
  publicBookingSchema,
  publicClinicSchema,
  publicHoldSchema
} from "@dentalops/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { api } from "../../lib/api"
import { queryKeys } from "../../lib/query-keys"

export const AVAILABILITY_KEY = "public-availability"
export const MANAGE_KEY = "public-manage"

interface AvailabilityInput {
  clinicSlug: string
  serviceId: string | null
  branchId: string | null
  dentistId: string | null
  date: string
  enabled: boolean
}

export interface HoldInput {
  serviceId: string
  branchId: string
  dentistId: string
  startsAt: string
}

export interface ConfirmInput {
  holdId: string
  name: string
  phone: string
  email?: string
}

export const useClinic = (clinicSlug: string) =>
  useQuery({
    queryKey: queryKeys.publicClinic(clinicSlug),
    queryFn: () => api(`/public/${clinicSlug}`, publicClinicSchema)
  })

export const usePublicAvailability = (input: AvailabilityInput) =>
  useQuery({
    queryKey: [
      AVAILABILITY_KEY,
      input.clinicSlug,
      input.serviceId,
      input.branchId,
      input.dentistId ?? "any",
      input.date
    ],
    enabled: input.enabled && input.serviceId !== null && input.branchId !== null,
    queryFn: () =>
      api(`/public/${input.clinicSlug}/availability`, availabilityResponseSchema, {
        query: {
          serviceId: input.serviceId ?? undefined,
          branchId: input.branchId ?? undefined,
          date: input.date,
          dentistId: input.dentistId ?? undefined
        }
      })
  })

export const useCreateHold = (clinicSlug: string) =>
  useMutation({
    mutationFn: (input: HoldInput) =>
      api(`/public/${clinicSlug}/holds`, publicHoldSchema, { method: "POST", body: input })
  })

export const useReleaseHold = (clinicSlug: string) =>
  useMutation({
    mutationFn: (holdId: string) =>
      api(`/public/${clinicSlug}/holds/${holdId}`, z.void(), { method: "DELETE" })
  })

export const useConfirmBooking = (clinicSlug: string) =>
  useMutation({
    mutationFn: (input: ConfirmInput) =>
      api(`/public/${clinicSlug}/appointments`, publicBookingSchema, {
        method: "POST",
        body: input
      })
  })

export const useManagedBooking = (token: string) =>
  useQuery({
    queryKey: queryKeys.publicManage.byToken(token),
    queryFn: () => api(`/public/manage/${token}`, publicAppointmentSchema)
  })

export const useCancelBooking = (token: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api(`/public/manage/${token}/cancel`, z.void(), { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.publicManage.byToken(token) })
  })
}

export const useRescheduleBooking = (token: string) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (holdId: string) =>
      api(`/public/manage/${token}/reschedule`, publicAppointmentSchema, {
        method: "POST",
        body: { holdId }
      }),
    onSuccess: (appointment) => {
      queryClient.setQueryData(queryKeys.publicManage.byToken(token), appointment)
      void queryClient.invalidateQueries({ queryKey: queryKeys.publicAvailability.root() })
    }
  })
}
