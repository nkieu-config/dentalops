import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cycleTheme,
  initTheme,
  readThemePreference,
  resolvesToDark,
  setThemePreference
} from "./theme"

const listeners = new Set<() => void>()
let systemPrefersDark = false

const installMatchMedia = () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("dark") && systemPrefersDark,
    addEventListener: (_: string, handler: () => void) => listeners.add(handler),
    removeEventListener: (_: string, handler: () => void) => listeners.delete(handler)
  }))
}

const systemSwitchesTo = (dark: boolean) => {
  systemPrefersDark = dark
  for (const handler of listeners) handler()
}

const isDark = () => document.documentElement.classList.contains("dark")

beforeEach(() => {
  localStorage.clear()
  listeners.clear()
  systemPrefersDark = false
  document.documentElement.classList.remove("dark")
  installMatchMedia()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("theme preference", () => {
  it("defaults to system when nothing is stored", () => {
    expect(readThemePreference()).toBe("system")
  })

  it("treats a corrupted stored value as system rather than throwing", () => {
    localStorage.setItem("dentalops-theme", "chartreuse")
    expect(readThemePreference()).toBe("system")
  })

  it("still honours the light and dark values written before the third state existed", () => {
    localStorage.setItem("dentalops-theme", "dark")
    initTheme()
    expect(isDark()).toBe(true)

    setThemePreference("light")
    expect(isDark()).toBe(false)
  })

  it("cycles light to dark to system and back to light", () => {
    setThemePreference("light")
    expect(cycleTheme()).toBe("dark")
    expect(cycleTheme()).toBe("system")
    expect(cycleTheme()).toBe("light")
  })

  it("keeps working when storage is denied, which is private browsing, not an edge case", () => {
    const denied = () => {
      throw new Error("Access to storage is denied")
    }
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied)
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(denied)

    expect(readThemePreference()).toBe("system")
    expect(() => setThemePreference("dark")).not.toThrow()
    expect(isDark()).toBe(true)

    vi.restoreAllMocks()
  })

  it("resolves system against the operating system, not against a stored colour", () => {
    systemPrefersDark = true
    expect(resolvesToDark("system")).toBe(true)
    expect(resolvesToDark("light")).toBe(false)
  })

  it("follows the operating system while the preference is system", () => {
    initTheme()
    expect(isDark()).toBe(false)

    systemSwitchesTo(true)
    expect(isDark()).toBe(true)
  })

  it("stops following the operating system once a theme is chosen explicitly", () => {
    initTheme()
    setThemePreference("light")

    systemSwitchesTo(true)
    expect(isDark()).toBe(false)
  })
})
