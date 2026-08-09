import { RotateCcw } from "lucide-react"

export const SystemStatus = ({ demo }: { demo: boolean }) =>
  demo ? (
    <span
      data-testid="demo-banner"
      className="hidden items-center gap-1 text-meta font-bold text-muted-foreground sm:inline-flex"
    >
      <RotateCcw className="size-3" aria-hidden />
      Demo resets periodically
    </span>
  ) : null
