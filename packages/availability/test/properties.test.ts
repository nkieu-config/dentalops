import fc from "fast-check"
import { describe, expect, it } from "vitest"
import { Interval, intersectLists, normalize, overlaps, subtract } from "../src/interval"
import { hasFreeUnit } from "../src/pool"
import { computeSlots } from "../src/slots"
import { expandRecurrence } from "../src/recurrence"

const M = 60_000

const arbInterval = fc
  .tuple(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 1, max: 100 }))
  .map(([a, len]) => ({ start: a * M, end: (a + len) * M }))

const arbIntervalList = fc.array(arbInterval, { maxLength: 12 })

const measure = (list: Interval[]): number =>
  normalize(list).reduce((sum, i) => sum + (i.end - i.start), 0)

describe("interval algebra", () => {
  it("subtract and intersect partition the base: |A\\B| + |A∩B| = |A|", () => {
    fc.assert(
      fc.property(arbIntervalList, arbIntervalList, (a, b) => {
        expect(measure(subtract(a, b)) + measure(intersectLists(a, b))).toBe(measure(a))
      })
    )
  })

  it("subtract never overlaps a hole", () => {
    fc.assert(
      fc.property(arbIntervalList, arbIntervalList, (a, b) => {
        for (const piece of subtract(a, b)) {
          for (const hole of b) {
            expect(overlaps(piece, hole)).toBe(false)
          }
        }
      })
    )
  })

  it("normalize is idempotent and produces sorted disjoint intervals", () => {
    fc.assert(
      fc.property(arbIntervalList, (a) => {
        const once = normalize(a)
        expect(normalize(once)).toEqual(once)
        for (let i = 1; i < once.length; i++) {
          expect(once[i]!.start).toBeGreaterThan(once[i - 1]!.end)
        }
      })
    )
  })
})

describe("slot honesty", () => {
  const arbUnit = (name: string) =>
    fc
      .tuple(fc.integer({ min: 0, max: 9 }), arbIntervalList)
      .map(([n, busy]) => ({ id: `${name}${n}`, busy }))

  it("every reported slot lies in a shift, avoids busy, sits on the grid, and has a chair", () => {
    fc.assert(
      fc.property(
        arbIntervalList,
        arbIntervalList,
        fc.array(arbUnit("c"), { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 1, max: 8 }).map((n) => n * 15),
        fc.integer({ min: 0, max: 2 }).map((n) => n * 5),
        (shifts, busy, chairs, durationMin, bufferMin) => {
          const window = { start: 0, end: 500 * M }
          const slots = computeSlots({
            window,
            stepMin: 15,
            durationMin,
            bufferMin,
            staff: [{ staffId: "d1", shifts, busy }],
            chairs,
            equipmentPools: []
          })
          for (const slot of slots) {
            expect(slot.end - slot.start).toBe(durationMin * M)
            expect(slot.start % (15 * M)).toBe(0)
            expect(
              normalize(shifts).some((s) => s.start <= slot.start && slot.end <= s.end)
            ).toBe(true)
            for (const b of busy) {
              expect(overlaps(slot, b)).toBe(false)
            }
            expect(
              hasFreeUnit(chairs, { start: slot.start, end: slot.end + bufferMin * M })
            ).toBe(true)
          }
        }
      )
    )
  })
})

describe("recurrence laws", () => {
  const arbWeeklyRule = fc.record({
    freq: fc.constant("weekly" as const),
    interval: fc.integer({ min: 1, max: 3 }),
    byWeekday: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 4 }),
    timeStartMin: fc.integer({ min: 0, max: 95 }).map((n) => n * 15),
    durationMin: fc.integer({ min: 1, max: 32 }).map((n) => n * 15),
    startsOn: fc.integer({ min: 0, max: 364 }).map((d) =>
      new Date(Date.parse("2026-01-01T00:00:00Z") + d * 86_400_000).toISOString().slice(0, 10)
    ),
    count: fc.integer({ min: 1, max: 20 })
  })

  it("every occurrence falls on an allowed local weekday and count bounds the total", () => {
    fc.assert(
      fc.property(arbWeeklyRule, (rule) => {
        const window = {
          start: Date.parse("2026-01-01T00:00:00Z"),
          end: Date.parse("2028-01-01T00:00:00Z")
        }
        const out = expandRecurrence(rule, window)
        expect(out.length).toBeLessThanOrEqual(rule.count)
        for (const occ of out) {
          const localDay = Math.floor(
            (occ.start + 420 * 60_000 - rule.timeStartMin * 60_000) / 86_400_000
          )
          expect(rule.byWeekday).toContain((((localDay + 4) % 7) + 7) % 7)
        }
      })
    )
  })
})
