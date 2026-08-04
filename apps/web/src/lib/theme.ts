export type ThemePreference = "light" | "dark" | "system"

const STORAGE_KEY = "dentalops-theme"
const DARK_QUERY = "(prefers-color-scheme: dark)"

const isPreference = (value: string | null): value is ThemePreference =>
  value === "light" || value === "dark" || value === "system"

const readStored = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

const writeStored = (preference: ThemePreference): boolean => {
  try {
    localStorage.setItem(STORAGE_KEY, preference)
    return true
  } catch {
    return false
  }
}

export const readThemePreference = (): ThemePreference => {
  const stored = readStored()
  return isPreference(stored) ? stored : "system"
}

export const resolvesToDark = (preference: ThemePreference): boolean =>
  preference === "system" ? matchMedia(DARK_QUERY).matches : preference === "dark"

const apply = (preference: ThemePreference) => {
  document.documentElement.classList.toggle("dark", resolvesToDark(preference))
}

export const initTheme = () => {
  apply(readThemePreference())
  matchMedia(DARK_QUERY).addEventListener("change", () => {
    if (readThemePreference() === "system") apply("system")
  })
}

export const setThemePreference = (preference: ThemePreference) => {
  writeStored(preference)
  apply(preference)
}

const nextPreference: Record<ThemePreference, ThemePreference> = {
  light: "dark",
  dark: "system",
  system: "light"
}

export const cycleTheme = (): ThemePreference => {
  const next = nextPreference[readThemePreference()]
  setThemePreference(next)
  return next
}
