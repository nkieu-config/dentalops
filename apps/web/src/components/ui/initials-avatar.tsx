import { cn } from "../../lib/cn"

interface InitialsAvatarProps {
  name: string
  className?: string
}

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

export const InitialsAvatar = ({ name, className }: InitialsAvatarProps) => (
  <span
    aria-hidden="true"
    className={cn(
      "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary type-meta font-bold text-secondary-foreground",
      className
    )}
  >
    {initialsFor(name)}
  </span>
)
