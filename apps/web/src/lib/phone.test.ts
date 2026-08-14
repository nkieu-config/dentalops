import { describe, expect, it } from "vitest"
import { isValidPhone, normalizePhone } from "./phone"

describe("phone", () => {
  it("accepts the 9 and 10 digit numbers the API accepts", () => {
    expect(isValidPhone("0812345678")).toBe(true)
    expect(isValidPhone("021234567")).toBe(true)
  })

  it("rejects what the API rejects", () => {
    expect(isValidPhone("")).toBe(false)
    expect(isValidPhone("812345678")).toBe(false)
    expect(isValidPhone("08123456")).toBe(false)
    expect(isValidPhone("08123456789")).toBe(false)
    expect(isValidPhone("081234567a")).toBe(false)
  })

  it("reads a number the way people write it down, and hands the API a clean one", () => {
    expect(isValidPhone("081 234 5678")).toBe(true)
    expect(isValidPhone("081-234-5678")).toBe(true)
    expect(normalizePhone("081-234 5678")).toBe("0812345678")
  })
})
