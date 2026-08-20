import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const CSS_PATH = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), "../src/app.css")

const relativeLuminance = (hex) => {
  const value = hex.replace("#", "")
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

const contrast = (a, b) => {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

const HEX = /^#[0-9a-fA-F]{6}$/
const ALIAS = /^var\(\s*(--[\w-]+)\s*\)$/

const collectBlocks = (css, selector) => {
  const pattern = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "g")
  const declarations = {}
  for (const match of css.matchAll(pattern)) {
    for (const declaration of match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      declarations[declaration[1]] = declaration[2].trim()
    }
  }
  return declarations
}

const resolveAliases = (declarations) => {
  const tokens = {}
  for (const [name, declared] of Object.entries(declarations)) {
    let value = declared
    const visited = new Set([name])
    while (ALIAS.test(value)) {
      const target = value.match(ALIAS)[1]
      if (visited.has(target)) {
        value = undefined
        break
      }
      visited.add(target)
      value = declarations[target]
      if (value === undefined) break
    }
    if (value !== undefined && HEX.test(value)) tokens[name] = value.toLowerCase()
  }
  return tokens
}

const css = readFileSync(CSS_PATH, "utf8")
const themes = {
  light: resolveAliases(collectBlocks(css, ":root")),
  dark: resolveAliases({ ...collectBlocks(css, ":root"), ...collectBlocks(css, "\\.dark") })
}

const TEXT_ON_SURFACE = 4.5
const NON_TEXT = 3
const SURFACE_SEPARATION = 1.05
const SURFACE_INVERSION = 1.15
const HUE_OFF_CHROME = 1.15

const SURFACES = ["--background", "--card", "--muted", "--secondary", "--accent"]

const PAIRS = [
  ...SURFACES.map((surface) => ["--foreground", surface, TEXT_ON_SURFACE]),
  ...SURFACES.map((surface) => ["--muted-foreground", surface, TEXT_ON_SURFACE]),
  ["--primary-foreground", "--primary", TEXT_ON_SURFACE],
  ["--primary", "--secondary", NON_TEXT],
  ["--secondary-foreground", "--secondary", TEXT_ON_SURFACE],
  ["--destructive-foreground", "--destructive", TEXT_ON_SURFACE],
  ["--warning-foreground", "--warning", TEXT_ON_SURFACE],
  ["--success-foreground", "--success", TEXT_ON_SURFACE],
  ["--primary-on-surface", "--primary-surface", TEXT_ON_SURFACE],
  ["--destructive-on-surface", "--destructive-surface", TEXT_ON_SURFACE],
  ["--warning-on-surface", "--warning-surface", TEXT_ON_SURFACE],
  ["--success-on-surface", "--success-surface", TEXT_ON_SURFACE],
  ["--decorative-on-surface", "--decorative-surface", TEXT_ON_SURFACE],
  ["--foreground", "--selection", TEXT_ON_SURFACE],
  ["--primary-on-surface", "--background", TEXT_ON_SURFACE],
  ["--destructive", "--background", TEXT_ON_SURFACE],
  ["--warning", "--background", TEXT_ON_SURFACE],
  ["--success", "--background", TEXT_ON_SURFACE],
  ["--decorative", "--background", TEXT_ON_SURFACE],
  ["--input", "--card", NON_TEXT],
  ["--input", "--background", NON_TEXT],
  ["--ring", "--background", NON_TEXT],
  ["--ring", "--card", NON_TEXT],
  ["--destructive", "--card", NON_TEXT],
  ["--destructive", "--destructive-surface", NON_TEXT],
  ["--surface-inverse-foreground", "--surface-inverse", TEXT_ON_SURFACE],
  ["--surface-inverse-border", "--surface-inverse", SURFACE_SEPARATION],
  ["--surface-subtle", "--card", SURFACE_SEPARATION],
  ["--surface-band", "--background", SURFACE_SEPARATION],
  ["--card", "--surface-band", SURFACE_SEPARATION],
  ["--decorative-surface", "--background", SURFACE_SEPARATION],
  ["--spotlight", "--background", SURFACE_SEPARATION],
  ["--secondary", "--spotlight", SURFACE_SEPARATION],
  ["--primary", "--spotlight", NON_TEXT],
  ["--foreground", "--spotlight", TEXT_ON_SURFACE],
  ["--surface-inverse", "--background", SURFACE_INVERSION],
  ["--timeline-header", "--timeline-canvas", SURFACE_SEPARATION],
  ["--timeline-offshift", "--timeline-canvas", SURFACE_SEPARATION],
  ["--timeline-resource-line", "--timeline-canvas", SURFACE_SEPARATION],
  ["--timeline-hour-line", "--timeline-canvas", SURFACE_SEPARATION],
  ["--timeline-current-time", "--timeline-canvas", NON_TEXT],
  ["--timeline-current-time-foreground", "--timeline-current-time", TEXT_ON_SURFACE],
  ["--hue0-border", "--primary", HUE_OFF_CHROME]
]

for (let hue = 0; hue <= 5; hue += 1) {
  PAIRS.push([`--card-foreground`, `--hue${hue}-bg`, TEXT_ON_SURFACE])
  PAIRS.push([`--appointment-muted`, `--hue${hue}-bg`, TEXT_ON_SURFACE])
  PAIRS.push([`--hue${hue}-border`, `--background`, NON_TEXT])
}

const failures = []
const missing = new Set()
let checked = 0

for (const [themeName, tokens] of Object.entries(themes)) {
  for (const [foreground, background, minimum] of PAIRS) {
    const fg = tokens[foreground]
    const bg = tokens[background]
    if (!fg || !bg) {
      missing.add(!fg ? foreground : background)
      continue
    }
    checked += 1
    const ratio = contrast(fg, bg)
    if (ratio < minimum) {
      failures.push(
        `${themeName.padEnd(5)} ${ratio.toFixed(2).padStart(6)} : 1  (needs ${minimum})  ` +
          `${foreground} ${fg} on ${background} ${bg}`
      )
    }
  }
}

if (missing.size > 0) {
  console.error(`Tokens absent from app.css, so their pairs were not checked:`)
  for (const token of [...missing].sort()) console.error(`  ${token}`)
  console.error("")
}

if (failures.length > 0) {
  console.error(`Contrast failures (${failures.length} of ${checked} pairs checked):`)
  for (const failure of failures) console.error(`  ${failure}`)
  console.error("")
  console.error("Every colour must be named by a pair; see the token definitions in apps/web/src/app.css.")
  process.exit(1)
}

if (missing.size > 0) {
  console.error("Refusing to pass while tokens named by the design system are missing.")
  process.exit(1)
}

console.log(`All ${checked} token pairs meet their contrast minimum in both themes.`)
