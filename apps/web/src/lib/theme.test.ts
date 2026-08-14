import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
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

const CHROME_SURFACES = [
  "--background",
  "--card",
  "--surface-subtle",
  "--muted",
  "--secondary",
  "--offshift",
  "--border",
  "--grid-line",
  "--grid-line-hour",
  "--accent",
  "--input"
]

const darkTokens = (): Record<string, string> => {
  const css = stylesheet()
  const tokens: Record<string, string> = {}
  for (const block of css.matchAll(/(?::root|\.dark)\s*\{([^}]*)\}/g)) {
    for (const declaration of block[1]!.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
      tokens[declaration[1]!] = declaration[2]!
    }
  }
  return tokens
}

const oklchChroma = (hex: string): number => {
  const toLinear = (channel: number) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  const [r, g, b] = [0, 2, 4].map((offset) =>
    toLinear(parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255)
  ) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return Math.hypot(
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  )
}


const here = dirname(fileURLToPath(import.meta.url))
const stylesheet = () => readFileSync(resolve(here, "../app.css"), "utf8")

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

describe("Sea Glass design tokens", () => {
  it("defines the approved light clinic palette", () => {
    const css = stylesheet()
    expect(css).toMatch(/--background:\s*#F8FBFA;/)
    expect(css).toMatch(/--foreground:\s*#243330;/)
    expect(css).toMatch(/--primary:\s*#237C78;/)
    expect(css).toMatch(/--border:\s*#D8E6E2;/)
  })

  it("defines a green-charcoal dark palette rather than the industrial black theme", () => {
    const css = stylesheet()
    expect(css).toMatch(/\.dark\s*\{[\s\S]*--background:\s*#1A1F1E;/)
    expect(css).toMatch(/\.dark\s*\{[\s\S]*--primary:\s*#7FC4B9;/)
  })

  it("keeps dark chrome quieter than the hues that carry appointment data", () => {
    const dark = darkTokens()
    const chromaOf = (token: string) => oklchChroma(dark[token]!)
    const dataHues = [0, 1, 2, 3, 4, 5].map((n) => chromaOf(`--hue${n}-bg`))
    const quietestData = Math.min(...dataHues)

    for (const surface of CHROME_SURFACES) {
      expect(chromaOf(surface), `${surface} must recede behind appointment data`).toBeLessThan(
        quietestData
      )
    }
  })

  it("publishes named typography roles for page and section hierarchy", () => {
    const css = stylesheet()
    expect(css).toMatch(/--text-page-title:\s*1\.5rem;/)
    expect(css).toMatch(/--text-page-title--line-height:\s*2rem;/)
    expect(css).toMatch(/--text-section-title:\s*1\.25rem;/)
    expect(css).toMatch(/--text-section-title--line-height:\s*1\.75rem;/)
    expect(css).toMatch(/--text-meta:\s*0\.75rem;/)
    expect(css).toMatch(/--text-meta--line-height:\s*1rem;/)
  })

  it("names the approved compact, card and hero radii", () => {
    const css = stylesheet()
    expect(css).toMatch(/--radius-control:\s*0\.5rem;/)
    expect(css).toMatch(/--radius-card:\s*0\.875rem;/)
    expect(css).toMatch(/--radius-hero:\s*1\.375rem;/)
  })

  it("separates neutral work surfaces from the Sea Glass selection signal", () => {
    const css = stylesheet()
    expect(css).toMatch(/--surface-subtle:\s*#F5F8F7;/)
    expect(css).toMatch(/--selection:\s*#DDF2ED;/)
    expect(css).toMatch(/--color-surface-subtle:\s*var\(--surface-subtle\);/)
    expect(css).toMatch(/--color-selection:\s*var\(--selection\);/)
  })
})
