import type { Appointment } from "@dentalops/contracts"
import { Palette } from "lucide-react"
import { useMemo } from "react"
import { Button } from "../../components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover"
import { Tooltip } from "../../components/ui/tooltip"
import { appointmentHue } from "../../lib/appointment-hue"

interface ServiceLegendProps {
  appointments: Appointment[]
}

interface LegendEntry {
  name: string
  colorIndex: number
  count: number
}

export const ServiceLegend = ({ appointments }: ServiceLegendProps) => {
  const services = useMemo(() => {
    const seen = new Map<string, LegendEntry>()
    for (const appointment of appointments) {
      const entry = seen.get(appointment.service.id)
      if (entry) entry.count += 1
      else
        seen.set(appointment.service.id, {
          name: appointment.service.name,
          colorIndex: appointment.service.colorIndex,
          count: 1,
        })
    }
    return [...seen.values()].sort((left, right) => left.name.localeCompare(right.name))
  }, [appointments])

  if (services.length === 0) return null

  return (
    <Popover>
      <Tooltip content="What the card colours mean">
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            aria-label="What the card colours mean"
            data-testid="service-legend-trigger"
            className="min-w-11 shrink-0 px-0 text-muted-foreground hover:text-foreground sm:w-auto sm:px-3"
          >
            <Palette className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xl:inline">Colours</span>
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-64" data-testid="service-legend">
        <p className="mb-2 type-meta font-semibold uppercase tracking-wide text-muted-foreground">
          Services on this schedule
        </p>
        <ul className="space-y-1.5">
          {services.map((service) => {
            const hue = appointmentHue(service.colorIndex)
            return (
              <li key={service.name} className="flex min-w-0 items-center gap-2.5 type-ui">
                <span
                  aria-hidden="true"
                  className="size-3.5 shrink-0 rounded-sm border-l-[3px]"
                  style={{ backgroundColor: hue.background, borderLeftColor: hue.border }}
                />
                <span className="min-w-0 flex-1 truncate" title={service.name}>
                  {service.name}
                </span>
                <span className="shrink-0 type-meta text-muted-foreground tabular-nums">
                  {service.count}
                </span>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
