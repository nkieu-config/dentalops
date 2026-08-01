import { z } from "zod"

export const availabilitySlotSchema = z.object({
  dentistId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime()
})

export const availabilityResponseSchema = z.object({
  slots: z.array(availabilitySlotSchema)
})

export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>
export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>
