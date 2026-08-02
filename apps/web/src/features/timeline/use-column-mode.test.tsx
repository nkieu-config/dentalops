import type { Appointment, Resource, StaffMember } from "@dentalops/contracts"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { MemoryRouter, useLocation } from "react-router"
import { describe, expect, it } from "vitest"
import { useColumnMode } from "./use-column-mode"

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const anongId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const boonId = "8f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const chairOneId = "c1000000-0000-4000-8000-000000000001"
const chairTwoId = "c1000000-0000-4000-8000-000000000002"
const scannerId = "c1000000-0000-4000-8000-000000000009"

const dentists: StaffMember[] = [
  { id: anongId, name: "Dr. Anong", role: "dentist", isActive: true },
  { id: boonId, name: "Dr. Boon", role: "dentist", isActive: true }
]

const chairs: Resource[] = [
  { id: chairOneId, name: "Chair 1", type: "chair", branchId },
  { id: chairTwoId, name: "Chair 2", type: "chair", branchId }
]

const claim = (resourceId: string, status: "active" | "released") => ({
  id: `${resourceId}-claim`,
  resourceId,
  startsAt: "2026-08-03T02:00:00.000Z",
  endsAt: "2026-08-03T03:10:00.000Z",
  status
})

const appointment = (
  dentistId: string,
  claims: ReturnType<typeof claim>[],
  id = "a1000000-0000-4000-8000-000000000001"
) =>
  ({
    id,
    branchId,
    serviceId: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    dentistId,
    patientId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    startsAt: "2026-08-03T02:00:00.000Z",
    endsAt: "2026-08-03T03:00:00.000Z",
    status: "confirmed",
    version: 1,
    seriesId: null,
    service: { id: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Cleaning", colorIndex: 0 },
    patient: { id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "S. Chaiwat", phone: "081" },
    claims
  }) as Appointment

const setup = (entry = "/app/timeline?d=2026-08-03") =>
  renderHook(() => ({ ...useColumnMode({ dentists, chairs }), search: useLocation().search }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>
    )
  })

describe("useColumnMode", () => {
  it("groups by dentist when the url says nothing", () => {
    const { result } = setup()
    expect(result.current.mode).toBe("dentist")
    expect(result.current.columns).toEqual([
      { id: anongId, name: "Dr. Anong", staffId: anongId },
      { id: boonId, name: "Dr. Boon", staffId: boonId }
    ])
    expect(result.current.columnOf(appointment(boonId, []))).toBe(boonId)
  })

  it("puts an appointment in the column of the chair it holds", () => {
    const { result } = setup("/app/timeline?c=chair")
    expect(result.current.mode).toBe("chair")
    expect(result.current.columns).toEqual([
      { id: chairOneId, name: "Chair 1" },
      { id: chairTwoId, name: "Chair 2" }
    ])
    expect(result.current.columnOf(appointment(anongId, [claim(chairTwoId, "active")]))).toBe(
      chairTwoId
    )
  })

  it("gives no chair column to an appointment that released its chair", () => {
    const { result } = setup("/app/timeline?c=chair")
    expect(result.current.columnOf(appointment(anongId, [claim(chairOneId, "released")]))).toBeNull()
    expect(result.current.columnOf(appointment(anongId, []))).toBeNull()
  })

  it("ignores a claim on something that is not a chair", () => {
    const { result } = setup("/app/timeline?c=chair")
    expect(result.current.columnOf(appointment(anongId, [claim(scannerId, "active")]))).toBeNull()
  })

  it("falls back to dentist columns when the url carries nonsense", () => {
    const { result } = setup("/app/timeline?c=aisle")
    expect(result.current.mode).toBe("dentist")
  })

  it("carries the mode in the url so a reload and a shared link agree", () => {
    const { result } = setup("/app/timeline?d=2026-08-03")
    act(() => result.current.setMode("chair"))
    expect(result.current.search).toBe("?d=2026-08-03&c=chair")
    expect(result.current.mode).toBe("chair")

    act(() => result.current.setMode("dentist"))
    expect(result.current.search).toBe("?d=2026-08-03")
    expect(result.current.mode).toBe("dentist")
  })
})
