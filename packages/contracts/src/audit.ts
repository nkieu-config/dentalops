import { z } from "zod"

export const auditActorSchema = z.object({
  type: z.enum(["staff", "public"]),
  id: z.string(),
  name: z.string()
})

export const auditEntrySchema = z.object({
  tenantId: z.uuid(),
  actor: auditActorSchema,
  action: z.string(),
  entity: z.object({ type: z.string(), id: z.string() }),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  at: z.coerce.date(),
  requestId: z.string()
})

export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  nextCursor: z.string().nullable()
})

export type AuditActor = z.infer<typeof auditActorSchema>
export type AuditEntry = z.infer<typeof auditEntrySchema>
export type AuditPage = z.infer<typeof auditPageSchema>
