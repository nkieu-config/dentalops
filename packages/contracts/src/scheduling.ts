import { z } from "zod"

export const shiftSchema = z.looseObject({
  id: z.uuid(),
  staffId: z.uuid(),
  branchId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  seriesId: z.uuid().nullable().optional()
})

export const appointmentStatusSchema = z.enum([
  "confirmed",
  "completed",
  "cancelled",
  "no_show"
])

export const resourceClaimSchema = z.looseObject({
  id: z.uuid(),
  resourceId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: z.enum(["active", "released"])
})

export const patientSchema = z.looseObject({
  id: z.uuid(),
  name: z.string(),
  phone: z.string()
})

export const appointmentSchema = z.looseObject({
  id: z.uuid(),
  branchId: z.uuid(),
  serviceId: z.uuid(),
  dentistId: z.uuid(),
  patientId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  status: appointmentStatusSchema,
  version: z.number().int(),
  seriesId: z.uuid().nullable().optional(),
  service: z.looseObject({ id: z.uuid(), name: z.string(), colorIndex: z.number().int() }),
  patient: patientSchema,
  claims: z.array(resourceClaimSchema)
})

export const patientPageSchema = z.object({
  items: z.array(patientSchema),
  nextCursor: z.string().nullable()
})

export const editScopeSchema = z.enum(["this", "following", "all"])

export const appointmentSeriesSchema = z.looseObject({
  seriesId: z.uuid(),
  appointments: z.array(appointmentSchema)
})

export type Shift = z.infer<typeof shiftSchema>
export type Appointment = z.infer<typeof appointmentSchema>
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>
export type ResourceClaim = z.infer<typeof resourceClaimSchema>
export type Patient = z.infer<typeof patientSchema>
export type PatientPage = z.infer<typeof patientPageSchema>
export type EditScope = z.infer<typeof editScopeSchema>
export type AppointmentSeries = z.infer<typeof appointmentSeriesSchema>
