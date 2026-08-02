import { describe, expect, it } from "vitest"
import * as api from "../src/index"

describe("package surface", () => {
  it("re-exports the public function of every module", () => {
    expect(Object.keys(api).sort()).toEqual([
      "computeSlots",
      "expandRecurrence",
      "hasFreeUnit",
      "intersect",
      "intersectLists",
      "normalize",
      "overlaps",
      "subtract",
      "unitFree",
      "validateRoster"
    ])
  })
})
