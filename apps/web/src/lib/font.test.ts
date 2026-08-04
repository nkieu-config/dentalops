import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const here = dirname(fileURLToPath(import.meta.url))
const read = (relative: string) => readFileSync(resolve(here, relative), "utf8")

const importedFontPackage = () => {
  const entry = read("../main.tsx")
  const match = entry.match(/^import "(@fontsource[\w-]*\/[\w-]+)"/m)
  if (!match) throw new Error("main.tsx imports no @fontsource package")
  return match[1]!
}

const registeredFamily = (packageName: string) => {
  const stylesheet = readFileSync(createRequire(import.meta.url).resolve(packageName), "utf8")
  const match = stylesheet.match(/font-family:\s*['"]([^'"]+)['"]/)
  if (!match) throw new Error(`${packageName} declares no font-family`)
  return match[1]!
}

const declaredFamily = () => {
  const match = read("../app.css").match(/--font-sans:\s*([^;]+);/)
  if (!match) throw new Error("app.css declares no --font-sans")
  return match[1]!.split(",")[0]!.trim().replace(/^['"]|['"]$/g, "")
}

describe("the font the design system names is the font that loads", () => {
  it("declares the family that the imported fontsource package registers", () => {
    const packageName = importedFontPackage()
    expect(declaredFamily()).toBe(registeredFamily(packageName))
  })

  it("names a variable family, since fontsource registers those with a Variable suffix", () => {
    expect(declaredFamily()).toMatch(/ Variable$/)
  })

  it("keeps tabular figures switched on, which the time grid depends on", () => {
    expect(read("../app.css")).toMatch(/font-feature-settings:[^;]*"tnum"/)
  })
})
