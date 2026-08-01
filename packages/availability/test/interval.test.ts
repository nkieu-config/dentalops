import { describe, expect, it } from "vitest"
import { intersect, intersectLists, normalize, overlaps, subtract } from "../src/interval"

const iv = (start: number, end: number) => ({ start, end })

describe("overlaps", () => {
  it("detects a plain overlap", () => {
    expect(overlaps(iv(0, 10), iv(5, 15))).toBe(true)
  })
  it("boundary touch is not an overlap (half-open)", () => {
    expect(overlaps(iv(0, 10), iv(10, 20))).toBe(false)
  })
  it("containment is an overlap", () => {
    expect(overlaps(iv(0, 100), iv(40, 60))).toBe(true)
  })
})

describe("intersect", () => {
  it("returns the common part", () => {
    expect(intersect(iv(0, 10), iv(5, 15))).toEqual(iv(5, 10))
  })
  it("returns null when disjoint or only touching", () => {
    expect(intersect(iv(0, 10), iv(10, 20))).toBeNull()
    expect(intersect(iv(0, 10), iv(20, 30))).toBeNull()
  })
})

describe("normalize", () => {
  it("drops empty and inverted intervals", () => {
    expect(normalize([iv(5, 5), iv(9, 3)])).toEqual([])
  })
  it("sorts and merges overlapping and touching intervals", () => {
    expect(normalize([iv(20, 30), iv(0, 10), iv(10, 15), iv(14, 22)])).toEqual([iv(0, 30)])
  })
  it("keeps genuinely separate intervals apart", () => {
    expect(normalize([iv(0, 10), iv(11, 20)])).toEqual([iv(0, 10), iv(11, 20)])
  })
})

describe("subtract", () => {
  it("cuts a hole in the middle", () => {
    expect(subtract([iv(0, 100)], [iv(40, 60)])).toEqual([iv(0, 40), iv(60, 100)])
  })
  it("boundary-touching holes remove nothing", () => {
    expect(subtract([iv(10, 20)], [iv(0, 10), iv(20, 30)])).toEqual([iv(10, 20)])
  })
  it("a covering hole removes everything", () => {
    expect(subtract([iv(10, 20)], [iv(0, 30)])).toEqual([])
  })
  it("handles multiple bases and multiple unsorted holes", () => {
    expect(subtract([iv(0, 10), iv(20, 30)], [iv(25, 26), iv(2, 4)])).toEqual([
      iv(0, 2),
      iv(4, 10),
      iv(20, 25),
      iv(26, 30)
    ])
  })
})

describe("intersectLists", () => {
  it("returns pairwise common parts, normalized", () => {
    expect(intersectLists([iv(0, 10), iv(20, 30)], [iv(5, 25)])).toEqual([iv(5, 10), iv(20, 25)])
  })
  it("returns empty for disjoint lists", () => {
    expect(intersectLists([iv(0, 10)], [iv(10, 20)])).toEqual([])
  })
})
