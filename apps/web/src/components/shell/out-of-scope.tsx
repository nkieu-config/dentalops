import type { LucideIcon } from "lucide-react"

const README_GAPS = "https://github.com/nkieu-config/dentalops#what-this-deliberately-does-not-do"

interface OutOfScopeProps {
  icon: LucideIcon
  title: string
  reason: string
}

export const OutOfScope = ({ icon: Icon, title, reason }: OutOfScopeProps) => (
  <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
    <Icon className="h-8 w-8 text-muted-foreground" />
    <p className="font-medium">{title}</p>
    <p className="max-w-prose type-body font-normal text-muted-foreground">{reason}</p>
    <a
      className="type-ui font-medium text-primary underline underline-offset-4"
      href={README_GAPS}
      target="_blank"
      rel="noreferrer"
    >
      Every deliberate gap is listed in the README
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  </div>
)
