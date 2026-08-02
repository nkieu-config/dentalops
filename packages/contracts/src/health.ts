import { z } from "zod"

export const auditHealthSchema = z.enum(["connected", "disabled"])

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  auditLog: auditHealthSchema
})

export type AuditHealth = z.infer<typeof auditHealthSchema>

export type HealthResponse = z.infer<typeof healthResponseSchema>
