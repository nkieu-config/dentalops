import { Monitor, Moon, Sun } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useState } from "react"
import { cycleTheme, readThemePreference, type ThemePreference } from "../../lib/theme"
import { Button } from "../ui/button"

const face: Record<ThemePreference, { icon: LucideIcon; now: string; next: string }> = {
  light: { icon: Sun, now: "Light", next: "dark" },
  dark: { icon: Moon, now: "Dark", next: "system" },
  system: { icon: Monitor, now: "System", next: "light" }
}

export const ThemeToggle = () => {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    typeof window === "undefined" ? "system" : readThemePreference()
  )
  const { icon: Icon, now, next } = face[preference]

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`${now} theme. Switch to ${next}`}
      onClick={() => setPreference(cycleTheme())}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </Button>
  )
}
