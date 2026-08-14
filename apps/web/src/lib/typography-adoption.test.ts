import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const sourceRoot = join(process.cwd(), "src")

const collectProductionViews = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return collectProductionViews(path)
    if (!path.endsWith(".tsx") || path.endsWith(".test.tsx")) return []
    return [path]
  })

describe("typography adoption", () => {
  it("uses semantic type roles instead of raw font-size utilities", () => {
    const violations = collectProductionViews(sourceRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8")
      const matches = source.match(/\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|\[[^\]]+\])/g) ?? []
      return matches.map((utility) => `${path.replace(`${sourceRoot}/`, "")}: ${utility}`)
    })

    expect(violations).toEqual([])
  })
})
