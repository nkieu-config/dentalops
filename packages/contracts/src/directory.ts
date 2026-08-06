import { z } from "zod"
import { userRoleSchema } from "./auth"

const nameSchema = z.string().trim().min(2).max(80)
const slugSchema = z.string().regex(/^[a-z0-9-]{3,40}$/)
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const intervalSchema = z
  .tuple([timeSchema, timeSchema])
  .refine(([start, end]) => start < end, "An opening interval must end after it starts")

const dayHoursSchema = z
  .array(intervalSchema)
  .refine(
    (intervals) => intervals.every((interval, index) => index === 0 || intervals[index - 1]![1] <= interval[0]),
    "Opening intervals must be ordered and non-overlapping"
  )

export const openingHoursSchema = z
  .object({
    mon: dayHoursSchema,
    tue: dayHoursSchema,
    wed: dayHoursSchema,
    thu: dayHoursSchema,
    fri: dayHoursSchema,
    sat: dayHoursSchema,
    sun: dayHoursSchema
  })
  .strict()

export const createBranchSchema = z.object({
  name: nameSchema,
  timezone: z.string().min(1).max(80),
  openingHours: openingHoursSchema
})

export const updateBranchSchema = createBranchSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one branch field"
)

const serviceFieldsSchema = z.object({
  name: nameSchema,
  durationMin: z.number().int().min(15).max(480),
  bufferMin: z.number().int().min(0).max(120),
  colorIndex: z.number().int().min(0).max(5)
})

export const createServiceSchema = serviceFieldsSchema.extend({
  bufferMin: z.number().int().min(0).max(120).default(0),
  colorIndex: z.number().int().min(0).max(5).default(0)
})

export const updateServiceSchema = serviceFieldsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one service field"
)

export const createResourceSchema = z
  .object({
    name: nameSchema,
    branchId: z.uuid(),
    type: z.enum(["chair", "equipment"]),
    equipmentTypeId: z.uuid().optional()
  })
  .refine(
    (value) =>
      (value.type === "chair" && value.equipmentTypeId === undefined) ||
      (value.type === "equipment" && value.equipmentTypeId !== undefined),
    "Equipment requires an equipment type; chairs do not"
  )

export const updateResourceSchema = z
  .object({
    name: nameSchema.optional(),
    branchId: z.uuid().optional(),
    equipmentTypeId: z.uuid().nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one resource field")

export const updateStaffSchema = z
  .object({
    name: nameSchema.optional(),
    role: z.enum(["dentist", "receptionist"]).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one staff field")

export const clinicProfileSchema = z.object({
  id: z.uuid(),
  name: nameSchema,
  slug: slugSchema,
  publicBookingPath: z.string().regex(/^\/book\/[a-z0-9-]{3,40}$/)
})

export const updateClinicProfileSchema = z
  .object({ name: nameSchema.optional(), slug: slugSchema.optional() })
  .refine((value) => Object.keys(value).length > 0, "Provide a clinic name or slug")

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
export type OpeningHours = z.infer<typeof openingHoursSchema>
export type CreateBranch = z.infer<typeof createBranchSchema>
export type UpdateBranch = z.infer<typeof updateBranchSchema>
export type CreateService = z.infer<typeof createServiceSchema>
export type UpdateService = z.infer<typeof updateServiceSchema>
export type CreateResource = z.infer<typeof createResourceSchema>
export type UpdateResource = z.infer<typeof updateResourceSchema>
export type UpdateStaff = z.infer<typeof updateStaffSchema>
export type ClinicProfile = z.infer<typeof clinicProfileSchema>
export type UpdateClinicProfile = z.infer<typeof updateClinicProfileSchema>
