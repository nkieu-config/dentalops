import type { PublicBooking } from "@dentalops/contracts"

export type WizardStep = "service" | "dentist" | "slot" | "details" | "confirmed"

export type RecoveryReason = "expired" | "taken" | "held"

export interface WizardHold {
  holdId: string
  expiresAt: string
  startsAt: string
  dentistId: string
}

export interface WizardRecovery {
  reason: RecoveryReason
  startsAt: string
}

export interface WizardDetails {
  name: string
  phone: string
  email: string
}

export interface WizardState {
  step: WizardStep
  branchId: string | null
  serviceId: string | null
  dentistId: string | null
  date: string
  hold: WizardHold | null
  recovery: WizardRecovery | null
  details: WizardDetails
  booking: PublicBooking | null
}

export type WizardAction =
  | { type: "choose-branch"; branchId: string }
  | { type: "choose-service"; serviceId: string }
  | { type: "choose-dentist"; dentistId: string | null }
  | { type: "choose-date"; date: string }
  | { type: "hold-acquired"; hold: WizardHold }
  | { type: "edit-details"; details: Partial<WizardDetails> }
  | { type: "lose-hold"; reason: RecoveryReason }
  | { type: "slot-taken"; startsAt: string }
  | { type: "dismiss-recovery" }
  | { type: "booked"; booking: PublicBooking }
  | { type: "back" }

export const STEP_ORDER: WizardStep[] = ["service", "dentist", "slot", "details"]

export const initialWizardState = (date: string): WizardState => ({
  step: "service",
  branchId: null,
  serviceId: null,
  dentistId: null,
  date,
  hold: null,
  recovery: null,
  details: { name: "", phone: "", email: "" },
  booking: null
})

const PREVIOUS_STEP: Record<WizardStep, WizardStep> = {
  service: "service",
  dentist: "service",
  slot: "dentist",
  details: "slot",
  confirmed: "confirmed"
}

export const wizardReducer = (state: WizardState, action: WizardAction): WizardState => {
  switch (action.type) {
    case "choose-branch":
      return state.branchId === action.branchId ? state : { ...state, branchId: action.branchId }
    case "choose-service":
      return {
        ...state,
        step: "dentist",
        serviceId: action.serviceId,
        dentistId: null,
        hold: null,
        recovery: null
      }
    case "choose-dentist":
      return { ...state, step: "slot", dentistId: action.dentistId, recovery: null }
    case "choose-date":
      return { ...state, date: action.date }
    case "hold-acquired":
      return { ...state, step: "details", hold: action.hold, recovery: null }
    case "edit-details":
      return { ...state, details: { ...state.details, ...action.details } }
    case "lose-hold":
      if (!state.hold) return state
      return {
        ...state,
        step: "slot",
        hold: null,
        recovery: { reason: action.reason, startsAt: state.hold.startsAt }
      }
    case "slot-taken":
      return { ...state, recovery: { reason: "held", startsAt: action.startsAt } }
    case "dismiss-recovery":
      return state.recovery === null ? state : { ...state, recovery: null }
    case "booked":
      return { ...state, step: "confirmed", booking: action.booking, hold: null, recovery: null }
    case "back": {
      const step = PREVIOUS_STEP[state.step]
      if (step === state.step) return state
      return { ...state, step, hold: null }
    }
  }
}
