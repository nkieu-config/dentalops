import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))
const read = (relative: string) => readFileSync(resolve(here, relative), "utf8")

const importedFontPackages = () => {
  const entry = read("../main.tsx")
  const matches = [...entry.matchAll(/^import "(@fontsource[\w-]*\/[\w-]+)"/gm)]
  if (matches.length === 0) throw new Error("main.tsx imports no @fontsource package")
  return matches.map((match) => match[1]!)
}

const registeredFamily = (packageName: string) => {
  const stylesheet = readFileSync(createRequire(import.meta.url).resolve(packageName), "utf8")
  const match = stylesheet.match(/font-family:\s*['"]([^'"]+)['"]/)
  if (!match) throw new Error(`${packageName} declares no font-family`)
  return match[1]!
}

const declaredFamilies = () => {
  const match = read("../app.css").match(/--font-sans:\s*([^;]+);/)
  if (!match) throw new Error("app.css declares no --font-sans")
  return match[1]!
    .split(",")
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
    .filter((part) => !/^(ui-sans-serif|system-ui|sans-serif)$/.test(part))
}

describe("the fonts the design system names are the fonts that load", () => {
  it("declares, in order, the family each imported fontsource package registers", () => {
    const packages = importedFontPackages()
    const declared = declaredFamilies()
    expect(declared).toHaveLength(packages.length)
    expect(declared).toEqual(packages.map(registeredFamily))
  })

  it("names only variable families, since fontsource registers those with a Variable suffix", () => {
    for (const family of declaredFamilies()) {
      expect(family).toMatch(/ Variable$/)
    }
  })

  it("falls back to a Thai-capable family, since Plus Jakarta Sans has no Thai glyphs", () => {
    expect(declaredFamilies()).toContain("Noto Sans Thai Variable")
  })

  it("defines the semantic typography roles the product surfaces consume", () => {
    const stylesheet = read("../app.css")
    const roles = [
      "display",
      "display-lg",
      "page-title",
      "section-title",
      "subsection-title",
      "dialog-title",
      "card-title",
      "body",
      "ui",
      "supporting",
      "meta",
      "dense"
    ]

    for (const role of roles) {
      expect(stylesheet).toMatch(new RegExp(`--text-${role}:`))
      expect(stylesheet).toMatch(new RegExp(`--text-${role}--line-height:`))
    }
  })

  it("keeps base UI text regular and makes tabular figures opt in", () => {
    const stylesheet = read("../app.css")
    const body = stylesheet.match(/\nbody\s*\{([^}]+)\}/)?.[1] ?? ""

    expect(body).toMatch(/font-size:\s*var\(--text-ui\)/)
    expect(body).toMatch(/font-weight:\s*400/)
    expect(body).toMatch(/line-height:\s*var\(--text-ui--line-height\)/)
    expect(stylesheet).not.toMatch(/html\s*\{[^}]*font-feature-settings:[^}]*"tnum"/s)
  })
})
