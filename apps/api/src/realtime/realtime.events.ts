export const REALTIME_NAMESPACE = "realtime"
export const APPOINTMENT_CHANGED = "appointment.changed"
export const SUBSCRIBE = "subscribe"

export type AppointmentAction = "created" | "rescheduled" | "status"

export interface AppointmentChangedEvent {
  appointmentId: string
  branchId: string
  action: AppointmentAction
}

export interface AppointmentChangedInput extends AppointmentChangedEvent {
  tenantId: string
}

export interface SubscribeInput {
  branchId?: unknown
}

export interface SubscribeAck {
  joined: string | null
}

export const branchRoom = (tenantId: string, branchId: string): string =>
  `tenant:${tenantId}:branch:${branchId}`
