import { CalendarX } from "lucide-react"
import { Button } from "../components/ui/button"
import { EmptyState } from "../components/ui/empty-state"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Skeleton } from "../components/ui/skeleton"

const swatches = [
  "background", "foreground", "primary", "secondary", "muted", "accent",
  "destructive", "warning", "success", "border"
]

export const DevUiPage = () => (
  <div className="mx-auto max-w-4xl space-y-10 p-8">
    <h1 className="text-2xl font-semibold">/dev/ui</h1>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Tokens</h2>
      <div className="flex flex-wrap gap-3">
        {swatches.map((name) => (
          <div key={name} className="text-center text-xs">
            <div
              className="h-12 w-12 rounded-md border border-border"
              style={{ background: `var(--color-${name})` }}
            />
            {name}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-12 w-12 rounded-sm border-l-[3px]"
            style={{ background: `var(--hue${i}-bg)`, borderLeftColor: `var(--hue${i}-border)` }}
          />
        ))}
      </div>
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Primitives</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button size="sm">Small</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="max-w-xs space-y-2">
        <Label htmlFor="demo-input">Label</Label>
        <Input id="demo-input" placeholder="Input" />
        <Skeleton className="h-9 w-full" />
      </div>
      <EmptyState icon={CalendarX} title="No appointments" hint="Drag on the grid to create one" />
    </section>
  </div>
)
