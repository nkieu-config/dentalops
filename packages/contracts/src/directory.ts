import { z } from "zod"
import { userRoleSchema } from "./auth"

export const branchSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  openingHours: z.unknown()
})

export const staffMemberSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: userRoleSchema,
  isActive: z.boolean()
})

export const createStaffSchema = z.object({
  name: z.string().min(1).max(80),
  email: z.email(),
  password: z.string().min(8).max(72),
  role: z.enum(["dentist", "receptionist"])
})

export const serviceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  durationMin: z.number().int(),
  bufferMin: z.number().int(),
  colorIndex: z.number().int(),
  isActive: z.boolean()
})

export const resourceTypeSchema = z.enum(["chair", "equipment"])

export const resourceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: resourceTypeSchema,
  branchId: z.uuid()
})

export type Branch = z.infer<typeof branchSchema>
export type StaffMember = z.infer<typeof staffMemberSchema>
export type CreateStaff = z.infer<typeof createStaffSchema>
export type ServiceSummary = z.infer<typeof serviceSummarySchema>
export type ResourceType = z.infer<typeof resourceTypeSchema>
export type Resource = z.infer<typeof resourceSchema>
