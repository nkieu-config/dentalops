import { RotateCcw } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"

export const SystemStatus = ({ demo }: { demo: boolean }) =>
  demo ? (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="demo-banner"
          aria-label="Demo workspace status"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 type-meta font-semibold text-secondary-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          <span>Demo</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <h2 className="type-ui font-semibold text-foreground">Demo workspace</h2>
        <p className="mt-1 type-supporting text-muted-foreground">Demo data resets periodically.</p>
      </PopoverContent>
    </Popover>
  ) : null
