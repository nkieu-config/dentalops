import { Monitor, Moon, Sun } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useState } from "react"
import { readThemePreference, setThemePreference, type ThemePreference } from "../../lib/theme"
import { Button } from "../ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu"

const face: Record<ThemePreference, { icon: LucideIcon; label: string }> = {
  light: { icon: Sun, label: "Light" },
  dark: { icon: Moon, label: "Dark" },
  system: { icon: Monitor, label: "System" }
}

export const ThemeToggle = () => {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    typeof window === "undefined" ? "system" : readThemePreference()
  )
  const { icon: Icon, label } = face[preference]

  const choose = (next: ThemePreference) => {
    setThemePreference(next)
    setPreference(next)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Theme: ${label}`}
      >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Theme">
        {(Object.keys(face) as ThemePreference[]).map((option) => (
          <DropdownMenuItem
            key={option}
            role="menuitemradio"
            aria-checked={preference === option}
            onSelect={() => choose(option)}
          >
            {face[option].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
