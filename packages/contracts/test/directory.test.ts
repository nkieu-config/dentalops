import { describe, expect, it } from "vitest"
import { clinicProfileSchema, openingHoursSchema, updateServiceSchema } from "../src/directory"

const weekdayHours = {
  mon: [["09:00", "20:00"]],
  tue: [["09:00", "20:00"]],
  wed: [["09:00", "20:00"]],
  thu: [["09:00", "20:00"]],
  fri: [["09:00", "20:00"]],
  sat: [["09:00", "17:00"]],
  sun: []
}

describe("openingHoursSchema", () => {
  it("accepts seven days of ordered, non-overlapping intervals", () => {
    expect(openingHoursSchema.safeParse(weekdayHours).success).toBe(true)
  })

  it("rejects an interval that ends before it starts", () => {
    expect(
      openingHoursSchema.safeParse({ ...weekdayHours, mon: [["20:00", "09:00"]] }).success
    ).toBe(false)
  })

  it("rejects overlapping intervals within a day", () => {
    expect(
      openingHoursSchema.safeParse({
        ...weekdayHours,
        mon: [
          ["09:00", "12:00"],
          ["11:30", "20:00"]
        ]
      }).success
    ).toBe(false)
  })
})

describe("clinicProfileSchema", () => {
  it("accepts the profile and supplies the changed public booking URL", () => {
    expect(
      clinicProfileSchema.parse({
        id: "f0000000-0000-4000-8000-000000000013",
        name: "Yim Suay Dental",
        slug: "yim-suay",
        publicBookingPath: "/book/yim-suay"
      })
    ).toMatchObject({ slug: "yim-suay", publicBookingPath: "/book/yim-suay" })
  })
})

describe("updateServiceSchema", () => {
  it("rejects an empty update instead of filling create-only defaults", () => {
    expect(updateServiceSchema.safeParse({}).success).toBe(false)
  })
})
