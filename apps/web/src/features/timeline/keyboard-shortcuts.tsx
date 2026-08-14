import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"

interface KeyboardShortcutsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  searchShortcut: string
  canMove?: boolean
}

interface ShortcutRow {
  keys: string[]
  action: string
}

const Keys = ({ keys }: { keys: string[] }) => (
  <span className="flex shrink-0 items-center gap-1">
    {keys.map((key) => (
      <kbd
        key={key}
        className="min-w-7 rounded border border-border bg-card px-1.5 py-0.5 text-center font-mono type-meta text-muted-foreground"
      >
        {key}
      </kbd>
    ))}
  </span>
)

const Group = ({ title, rows }: { title: string; rows: ShortcutRow[] }) => (
  <section className="space-y-1">
    <h3 className="type-meta font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {title}
    </h3>
    <ul className="divide-y divide-border/60">
      {rows.map((row) => (
        <li key={row.action} className="flex items-center justify-between gap-4 py-1.5">
          <span className="min-w-0 type-ui text-foreground">{row.action}</span>
          <Keys keys={row.keys} />
        </li>
      ))}
    </ul>
  </section>
)

export const KeyboardShortcuts = ({
  open,
  onOpenChange,
  searchShortcut,
  canMove = false,
}: KeyboardShortcutsProps) => (
  <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out" />
      <Dialog.Content
        data-testid="keyboard-shortcuts"
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border border-border bg-card text-card-foreground shadow-md focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
          <div className="min-w-0">
            <Dialog.Title className="type-dialog-title font-semibold">
              Keyboard shortcuts
            </Dialog.Title>
            <Dialog.Description className="mt-1 type-supporting text-muted-foreground">
              Press <span className="font-mono">?</span> any time to reopen this list.
            </Dialog.Description>
          </div>
          <Dialog.Close
            aria-label="Close keyboard shortcuts"
            className="-mr-2 -mt-2 grid min-h-11 min-w-11 shrink-0 place-items-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Dialog.Close>
        </div>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5 sm:pb-5">
          <Group
            title="Anywhere"
            rows={[
              { keys: searchShortcut.split(" "), action: "Search this schedule" },
              { keys: ["?"], action: "Show keyboard shortcuts" },
              { keys: ["Esc"], action: "Close the open panel" },
            ]}
          />
          <Group
            title="Move between bookings"
            rows={[
              { keys: ["↑"], action: "Earlier" },
              { keys: ["↓"], action: "Later" },
              { keys: ["←"], action: "Column to the left" },
              { keys: ["→"], action: "Column to the right" },
            ]}
          />
          {canMove ? (
            <Group
              title="Change the focused booking"
              rows={[
                { keys: ["Shift", "↑"], action: "Start 15 min earlier" },
                { keys: ["Shift", "↓"], action: "Start 15 min later" },
                { keys: ["Shift", "→"], action: "15 min longer" },
                { keys: ["Shift", "←"], action: "15 min shorter" },
              ]}
            />
          ) : null}
          <p className="type-supporting text-muted-foreground">
            {canMove
              ? "Focus a booking with Tab first. On a touchscreen, open it and choose Reschedule."
              : "Focus a booking with Tab first. Your role cannot change this schedule."}
          </p>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
)
