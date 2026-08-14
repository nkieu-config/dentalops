import { describe, expect, it } from "vitest"
import { queryKeys } from "./query-keys"

const startsWith = (key: readonly unknown[], prefix: readonly unknown[]): boolean =>
  prefix.every((segment, index) => key[index] === segment)

describe("query keys", () => {
  it("lets a root key invalidate every leaf beneath it", () => {
    const cases: Array<[readonly unknown[], readonly unknown[]]> = [
      [queryKeys.appointments.root(), queryKeys.appointments.day("b", 0)],
      [queryKeys.appointments.root(), queryKeys.appointments.week("b", "2026-08-10")],
      [queryKeys.shifts.root(), queryKeys.shifts.day("b", 0)],
      [queryKeys.shifts.root(), queryKeys.shifts.week("b", "2026-08-10")],
      [queryKeys.staff.root(), queryKeys.staff.all()],
      [queryKeys.staff.root(), queryKeys.staff.byRole("dentist")],
      [queryKeys.rosterValidation.root(), queryKeys.rosterValidation.for({})],
      [queryKeys.publicManage.root(), queryKeys.publicManage.byToken("t")],
      [queryKeys.publicAvailability.root(), queryKeys.publicAvailability.for("c", "s", "b", null, "d")]
    ]

    for (const [root, leaf] of cases) {
      expect(startsWith(leaf, root), `${JSON.stringify(leaf)} must sit under ${JSON.stringify(root)}`).toBe(true)
    }
  })

  it("keeps a day and a week of the same resource in separate caches", () => {
    expect(queryKeys.appointments.day("b", 0)).not.toEqual(queryKeys.appointments.week("b", "2026-08-10"))
    expect(queryKeys.shifts.day("b", 0)).not.toEqual(queryKeys.shifts.week("b", "2026-08-10"))
  })

  it("gives the timeline and the settings workspace one cache per endpoint", () => {
    expect(queryKeys.branches()).toEqual(["branches"])
    expect(queryKeys.services()).toEqual(["services"])
    expect(queryKeys.staff.all()).toEqual(["staff", "all"])
  })

  it("separates the two resource reads, which send different queries", () => {
    expect(queryKeys.resources.chairs("b")).not.toEqual(queryKeys.resources.includingInactive())
  })
})
