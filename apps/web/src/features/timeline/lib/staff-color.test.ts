import { describe, expect, it } from "vitest"
import { STAFF_HUE_COUNT, staffHue } from "./staff-color"

describe("staffHue", () => {
  it("always returns a hue within the palette range", () => {
    const ids = ["2f9619ff-8b86-4d01-b42d-00cf4fc964ff", "3f9619ff-8b86-4d01-b42d-00cf4fc964ff", "x"]
    for (const id of ids) {
      const hue = staffHue(id)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(STAFF_HUE_COUNT)
    }
  })

  it("is stable across calls for the same id", () => {
    const id = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
    expect(staffHue(id)).toBe(staffHue(id))
  })

  it("does not collapse every id onto the same hue", () => {
    const hues = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => staffHue(id))
    )
    expect(hues.size).toBeGreaterThan(1)
  })
})
