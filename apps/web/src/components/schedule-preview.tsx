import { Fragment } from "react"
import { cn } from "../lib/cn"

interface ScheduleBlock {
  start: number
  width: number
  hue: number
}

interface ScheduleRow {
  chair: string
  blocks: ScheduleBlock[]
}

export const schedulePreviewRows: ScheduleRow[] = [
  {
    chair: "Chair 1",
    blocks: [
      { start: 8, width: 18, hue: 0 },
      { start: 38, width: 15, hue: 2 }
    ]
  },
  {
    chair: "Chair 2",
    blocks: [
      { start: 18, width: 22, hue: 1 },
      { start: 58, width: 20, hue: 4 }
    ]
  },
  {
    chair: "Chair 3",
    blocks: [
      { start: 4, width: 16, hue: 5 },
      { start: 50, width: 32, hue: 3 }
    ]
  }
]

const HOUR_LABELS = ["9", "11", "1", "3", "5"]

export const SchedulePreview = ({ className }: { className?: string }) => (
  <div className={cn("flex flex-col gap-2", className)}>
    <div className="flex justify-between pl-[4.5rem] type-meta text-muted-foreground tabular-nums">
      {HOUR_LABELS.map((hour) => (
        <span key={hour}>{hour}</span>
      ))}
    </div>
    <div className="grid grid-cols-[3.5rem_1fr] items-center gap-x-4 gap-y-3">
      {schedulePreviewRows.map((row) => (
        <Fragment key={row.chair}>
          <span className="type-meta font-semibold text-foreground">{row.chair}</span>
          <div className="relative h-3 rounded-full" style={{ background: "var(--grid-line)" }}>
            {row.blocks.map((block, index) => (
              <span
                key={index}
                className="absolute inset-y-0 rounded-full"
                style={{
                  left: `${block.start}%`,
                  width: `${block.width}%`,
                  background: `var(--hue${block.hue}-border)`
                }}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </div>
  </div>
)
