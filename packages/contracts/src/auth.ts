import { z } from "zod"

export const userRoleSchema = z.enum(["owner", "receptionist", "dentist"])

export const sessionUserSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  name: z.string(),
  role: userRoleSchema
})

export const authSessionSchema = z.object({
  accessToken: z.string(),
  user: sessionUserSchema
})

export type UserRole = z.infer<typeof userRoleSchema>
export type SessionUser = z.infer<typeof sessionUserSchema>
export type AuthSession = z.infer<typeof authSessionSchema>
