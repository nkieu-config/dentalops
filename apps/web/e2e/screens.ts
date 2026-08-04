export interface Viewport {
  name: string
  width: number
  height: number
}

export const VIEWPORTS: Viewport[] = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 }
]

export type Theme = "light" | "dark"

export const THEMES: Theme[] = ["light", "dark"]

export interface Screen {
  name: string
  path: string | (() => Promise<string>)
  auth: "none" | "owner"
  settle?: string
}

export const PUBLIC_SCREENS: Screen[] = [
  { name: "landing", path: "/", auth: "none", settle: "button:has-text('Try as Owner')" },
  { name: "login", path: "/login", auth: "none" },
  { name: "signup", path: "/signup", auth: "none" },
  { name: "booking", path: "/book/demo-clinic", auth: "none" },
  { name: "dev-ui", path: "/dev/ui", auth: "none" }
]

export const APP_SCREENS: Screen[] = [
  { name: "timeline", path: "/app/timeline", auth: "owner" },
  { name: "roster", path: "/app/roster", auth: "owner" },
  { name: "patients", path: "/app/patients", auth: "owner" },
  { name: "settings", path: "/app/settings", auth: "owner" }
]

export const UNSNAPSHOTTABLE = [
  {
    name: "activity",
    path: "/app/activity",
    reason:
      "The audit feed photographs the run that photographs it. Every visit this suite makes to /app/roster appends an entry, so the list grows by eight rows per full run and every row below shifts. Masking timestamps makes it worse, not better, because the row count is what moves. It is covered by e2e/a11y.spec.ts and by the empty and error states in /dev/ui."
  }
] as const

export const THEME_STORAGE_KEY = "dentalops-theme"
