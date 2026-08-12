import { z } from "zod"
import { openingHoursSchema } from "./directory"
import { appointmentStatusSchema } from "./scheduling"

export const publicClinicSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  branches: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      timezone: z.string(),
      openingHours: openingHoursSchema
    })
  ),
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

export const holdIdSchema = z
  .string()
  .max(1024)
  .regex(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[\w-]+\.[\w-]+\.[\w-]+)$/i
  )

export const publicHoldSchema = z.object({
  holdId: holdIdSchema,
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
