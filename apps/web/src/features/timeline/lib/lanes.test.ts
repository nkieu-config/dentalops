import { describe, expect, it } from "vitest"
import { layoutLanes } from "./lanes"

const item = (id: string, start: number, end: number) => ({ id, start, end })

describe("layoutLanes", () => {
  it("disjoint items each get the full width", () => {
    const out = layoutLanes([item("a", 0, 10), item("b", 20, 30)])
    expect(out.get("a")).toEqual({ id: "a", lane: 0, lanes: 1 })
    expect(out.get("b")).toEqual({ id: "b", lane: 0, lanes: 1 })
  })

  it("touching boundaries do not overlap", () => {
    const out = layoutLanes([item("a", 0, 10), item("b", 10, 20)])
    expect(out.get("a")!.lanes).toBe(1)
    expect(out.get("b")!.lane).toBe(0)
  })

  it("two overlapping items split into two lanes", () => {
    const out = layoutLanes([item("a", 0, 20), item("b", 10, 30)])
    expect(out.get("a")).toEqual({ id: "a", lane: 0, lanes: 2 })
    expect(out.get("b")).toEqual({ id: "b", lane: 1, lanes: 2 })
  })

  it("a chain reuses freed lanes but the cluster shares its width", () => {
    const out = layoutLanes([item("a", 0, 20), item("b", 10, 40), item("c", 25, 50)])
    expect(out.get("a")!.lane).toBe(0)
    expect(out.get("b")!.lane).toBe(1)
    expect(out.get("c")!.lane).toBe(0)
    expect(out.get("a")!.lanes).toBe(2)
    expect(out.get("c")!.lanes).toBe(2)
  })

  it("separate clusters size independently", () => {
    const out = layoutLanes([
      item("a", 0, 20),
      item("b", 10, 20),
      item("c", 30, 40)
    ])
    expect(out.get("a")!.lanes).toBe(2)
    expect(out.get("c")!.lanes).toBe(1)
  })

  it("triple overlap needs three lanes", () => {
    const out = layoutLanes([item("a", 0, 30), item("b", 5, 30), item("c", 10, 30)])
    expect(out.get("c")).toEqual({ id: "c", lane: 2, lanes: 3 })
  })
})
