import { describe, expect, it } from "vitest"
import { SLUG_PATTERN, toSlug } from "./slug"

describe("toSlug", () => {
  it("lowercases and joins words with single hyphens", () => {
    expect(toSlug("Smile Dental")).toBe("smile-dental")
    expect(toSlug("SMILE DENTAL")).toBe("smile-dental")
  })

  it("collapses punctuation and runs of whitespace into one hyphen", () => {
    expect(toSlug("Smile & Co., Ltd.")).toBe("smile-co-ltd")
    expect(toSlug("Smile   Dental")).toBe("smile-dental")
    expect(toSlug("Clinic 24/7")).toBe("clinic-24-7")
  })

  it("drops leading and trailing hyphens", () => {
    expect(toSlug("  --Smile Dental--  ")).toBe("smile-dental")
  })

  it("strips accents rather than dropping the letter", () => {
    expect(toSlug("Café Dentaire")).toBe("cafe-dentaire")
  })

  it("returns an empty string for a Thai clinic name so the caller asks instead of guessing", () => {
    expect(toSlug("ยิ้มสวย ทันตคลินิก")).toBe("")
  })

  it("keeps only the latin part of a mixed name", () => {
    expect(toSlug("ยิ้มสวย Dental")).toBe("dental")
  })

  it("returns an empty string when the result would be shorter than the api minimum", () => {
    expect(toSlug("AB")).toBe("")
    expect(toSlug("K")).toBe("")
    expect(toSlug("")).toBe("")
    expect(toSlug("!!!")).toBe("")
  })

  it("keeps a short name that still clears three characters", () => {
    expect(toSlug("Dr K")).toBe("dr-k")
  })

  it("truncates to forty characters without leaving a trailing hyphen", () => {
    const long = toSlug("The Very Long Bangkok Family Dental Care Centre Sukhumvit")
    expect(long).toBe("the-very-long-bangkok-family-dental-care")
    expect(long.length).toBeLessThanOrEqual(40)
  })

  it("never returns something the api slug regex would reject", () => {
    const names = [
      "Smile Dental",
      "ยิ้มสวย ทันตคลินิก",
      "Café Dentaire",
      "AB",
      "Clinic 24/7",
      "The Very Long Bangkok Family Dental Care Centre Sukhumvit",
      "  --Smile Dental--  "
    ]
    for (const name of names) {
      const slug = toSlug(name)
      expect(slug === "" || SLUG_PATTERN.test(slug)).toBe(true)
    }
  })
})
