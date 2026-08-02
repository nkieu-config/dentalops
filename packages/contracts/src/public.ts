import { z } from "zod"
import { appointmentStatusSchema } from "./scheduling"

export const publicClinicSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  branches: z.array(z.object({ id: z.uuid(), name: z.string() })),
  services: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      durationMin: z.number().int(),
      colorIndex: z.number().int()
    })
  ),
  dentists: z.array(z.object({ id: z.uuid(), name: z.string() }))
})

export const publicHoldSchema = z.object({
  holdId: z.uuid(),
  expiresAt: z.iso.datetime()
})

export const publicAppointmentSchema = z.object({
  id: z.uuid(),
  status: appointmentStatusSchema,
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  clinic: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
  branch: z.object({ id: z.uuid(), name: z.string() }),
  service: z.object({ id: z.uuid(), name: z.string(), durationMin: z.number().int() }),
  dentist: z.object({ id: z.uuid(), name: z.string() }),
  patient: z.object({ id: z.uuid(), name: z.string() })
})

export const publicBookingSchema = z.object({
  appointment: publicAppointmentSchema,
  manageToken: z.string()
})

export type PublicClinic = z.infer<typeof publicClinicSchema>
export type PublicHold = z.infer<typeof publicHoldSchema>
export type PublicAppointment = z.infer<typeof publicAppointmentSchema>
export type PublicBooking = z.infer<typeof publicBookingSchema>
