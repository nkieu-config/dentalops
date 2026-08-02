import { z } from "zod"

export const violationSeveritySchema = z.enum(["block", "warn"])

export const violationSchema = z.object({
  rule: z.string(),
  severity: violationSeveritySchema,
  staffId: z.uuid(),
  detail: z.string(),
  appointmentIds: z.array(z.uuid()).optional()
})

export const rosterValidationSchema = z.object({
  violations: z.array(violationSchema)
})

export const draftShiftSchema = z.object({
  id: z.uuid().optional(),
  staffId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime()
})

export type ViolationSeverity = z.infer<typeof violationSeveritySchema>
export type Violation = z.infer<typeof violationSchema>
export type RosterValidation = z.infer<typeof rosterValidationSchema>
export type DraftShift = z.infer<typeof draftShiftSchema>
