import { z } from "zod"

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  errorCode: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string()
})

export type ApiError = z.infer<typeof apiErrorSchema>

export const slotConflictDetailsSchema = z.looseObject({
  conflictingAppointmentId: z.uuid().optional()
})

export type SlotConflictDetails = z.infer<typeof slotConflictDetailsSchema>

export const seriesConflictSchema = z.looseObject({
  startsAt: z.iso.datetime(),
  reason: z.string()
})

export const seriesConflictDetailsSchema = z.looseObject({
  conflicts: z.array(seriesConflictSchema)
})

export type SeriesConflict = z.infer<typeof seriesConflictSchema>
export type SeriesConflictDetails = z.infer<typeof seriesConflictDetailsSchema>
