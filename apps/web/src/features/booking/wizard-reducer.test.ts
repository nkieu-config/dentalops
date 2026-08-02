import type { PublicBooking } from "@dentalops/contracts"
import { describe, expect, it } from "vitest"
import {
  initialWizardState,
  wizardReducer,
  type WizardAction,
  type WizardHold,
  type WizardState
} from "./wizard-reducer"

const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const hold: WizardHold = {
  holdId: "3f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  expiresAt: "2026-08-03T03:05:00.000Z",
  startsAt: "2026-08-03T03:30:00.000Z",
  dentistId
}

const booking = {
  appointment: {
    id: "4f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    status: "confirmed",
    startsAt: "2026-08-03T03:30:00.000Z",
    endsAt: "2026-08-03T04:15:00.000Z",
    clinic: {
      id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      name: "Bright Smile Dental",
      slug: "demo-clinic"
    },
    branch: { id: branchId, name: "Sukhumvit" },
    service: { id: serviceId, name: "Cleaning", durationMin: 45 },
    dentist: { id: dentistId, name: "Dr. Anong" },
    patient: { id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Napat" }
  },
  manageToken: "a.b.c"
} satisfies PublicBooking

const start = () => initialWizardState("2026-08-03")

const run = (from: WizardState, ...actions: WizardAction[]): WizardState =>
  actions.reduce(wizardReducer, from)

const atDetails = () =>
  run(
    start(),
    { type: "choose-service", serviceId },
    { type: "choose-dentist", dentistId: null },
    { type: "hold-acquired", hold }
  )

describe("wizardReducer", () => {
  it("never mutates the state it is handed", () => {
    const before = Object.freeze(start())
    const after = wizardReducer(before, { type: "choose-service", serviceId })

    expect(after).not.toBe(before)
    expect(before.step).toBe("service")
    expect(before.serviceId).toBeNull()
    expect(after.serviceId).toBe(serviceId)
  })

  it("returns the identical object for actions that change nothing", () => {
    const fresh = start()

    expect(wizardReducer(fresh, { type: "back" })).toBe(fresh)
    expect(wizardReducer(fresh, { type: "dismiss-recovery" })).toBe(fresh)
    expect(wizardReducer(fresh, { type: "lose-hold", reason: "expired" })).toBe(fresh)
  })

  it("keeps the branch on its own action so it survives the rest of the wizard", () => {
    const other = "8f9619ff-8b86-4d01-b42d-00cf4fc964ff"
    const chosen = wizardReducer(start(), { type: "choose-branch", branchId })
    expect(chosen.branchId).toBe(branchId)
    expect(chosen.step).toBe("service")
    expect(wizardReducer(chosen, { type: "choose-branch", branchId })).toBe(chosen)

    const walked = run(
      chosen,
      { type: "choose-service", serviceId },
      { type: "choose-dentist", dentistId: null },
      { type: "hold-acquired", hold }
    )
    expect(walked.branchId).toBe(branchId)
    expect(wizardReducer(chosen, { type: "choose-branch", branchId: other }).branchId).toBe(other)
  })

  it("walks service to dentist to slot, keeping a null dentist as any dentist", () => {
    const service = wizardReducer(start(), { type: "choose-service", serviceId })
    expect(service.step).toBe("dentist")

    const any = wizardReducer(service, { type: "choose-dentist", dentistId: null })
    expect(any.step).toBe("slot")
    expect(any.dentistId).toBeNull()

    const named = wizardReducer(service, { type: "choose-dentist", dentistId })
    expect(named.dentistId).toBe(dentistId)
  })

  it("re-picking a service forgets the dentist chosen for the previous one", () => {
    const other = "7f9619ff-8b86-4d01-b42d-00cf4fc964ff"
    const state = run(
      start(),
      { type: "choose-service", serviceId },
      { type: "choose-dentist", dentistId },
      { type: "back" },
      { type: "back" },
      { type: "choose-service", serviceId: other }
    )

    expect(state.step).toBe("dentist")
    expect(state.serviceId).toBe(other)
    expect(state.dentistId).toBeNull()
  })

  it("moves to details when a hold is acquired and remembers what was held", () => {
    const state = atDetails()

    expect(state.step).toBe("details")
    expect(state.hold).toEqual(hold)
    expect(state.recovery).toBeNull()
  })

  it("drops the hold and returns to slot selection when going back from details", () => {
    const state = wizardReducer(atDetails(), { type: "back" })

    expect(state.step).toBe("slot")
    expect(state.hold).toBeNull()
    expect(state.recovery).toBeNull()
  })

  it("turns a lost hold into the recovery state naming the time that got away", () => {
    for (const reason of ["expired", "taken"] as const) {
      const state = wizardReducer(atDetails(), { type: "lose-hold", reason })

      expect(state.step).toBe("slot")
      expect(state.hold).toBeNull()
      expect(state.recovery).toEqual({ reason, startsAt: hold.startsAt })
    }
  })

  it("keeps what the patient typed across a lost hold and clears recovery on the next pick", () => {
    const typed = run(
      atDetails(),
      { type: "edit-details", details: { name: "Napat" } },
      { type: "edit-details", details: { phone: "0812345678" } },
      { type: "lose-hold", reason: "taken" }
    )
    expect(typed.details).toEqual({ name: "Napat", phone: "0812345678", email: "" })

    const retried = run(
      typed,
      { type: "dismiss-recovery" },
      { type: "hold-acquired", hold: { ...hold, startsAt: "2026-08-03T03:45:00.000Z" } }
    )
    expect(retried.step).toBe("details")
    expect(retried.recovery).toBeNull()
    expect(retried.details).toEqual({ name: "Napat", phone: "0812345678", email: "" })
  })

  it("changing the day keeps the rest of the choices intact", () => {
    const state = run(
      start(),
      { type: "choose-service", serviceId },
      { type: "choose-dentist", dentistId },
      { type: "choose-date", date: "2026-08-04" }
    )

    expect(state.date).toBe("2026-08-04")
    expect(state.step).toBe("slot")
    expect(state.serviceId).toBe(serviceId)
    expect(state.dentistId).toBe(dentistId)
  })

  it("lands on the confirmed step with the booking and no hold left over", () => {
    const state = wizardReducer(atDetails(), { type: "booked", booking })

    expect(state.step).toBe("confirmed")
    expect(state.booking).toEqual(booking)
    expect(state.hold).toBeNull()
  })

  it("is a closed loop — the confirmed step has no way back", () => {
    const confirmed = wizardReducer(atDetails(), { type: "booked", booking })

    expect(wizardReducer(confirmed, { type: "back" })).toBe(confirmed)
  })
})
