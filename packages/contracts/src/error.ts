import { z } from "zod"

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  errorCode: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  requestId: z.string()
})

export type ApiError = z.infer<typeof apiErrorSchema>
