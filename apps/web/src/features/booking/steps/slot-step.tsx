import { TimerOff } from "lucide-react"
import { SlotPickerView, type SlotPickerState } from "../../../components/slot-picker"
import { Button } from "../../../components/ui/button"
import { EmptyState } from "../../../components/ui/empty-state"
import { fmtTime } from "../../timeline/lib/geometry"
import type { WizardRecovery } from "../wizard-reducer"

interface SlotStepProps {
  date: string
  minDate?: string
  state: SlotPickerState
  recovery: WizardRecovery | null
  nearestFree: string | null
  holding: boolean
  selection?: string
  onPick: (startsAtIso: string) => void
  onDateChange: (isoDate: string) => void
  onPickAnother: () => void
  onRetry?: () => void
}

const RECOVERY_TITLE: Record<WizardRecovery["reason"], string> = {
  expired: "Your hold expired",
  taken: "That time was just booked",
  held: "Someone else is booking that time"
}

const RECOVERY_BODY: Record<WizardRecovery["reason"], string> = {
  expired: "was taken.",
  taken: "was taken.",
  held: "is being held by someone else right now."
}

export const SlotStep = ({
  date,
  minDate,
  state,
  recovery,
  nearestFree,
  holding,
  selection,
  onPick,
  onDateChange,
  onPickAnother,
  onRetry
}: SlotStepProps) => {
  if (recovery) {
    return (
      <div data-testid="hold-recovery">
        <EmptyState
          icon={TimerOff}
          title={RECOVERY_TITLE[recovery.reason]}
          hint={`${fmtTime(Date.parse(recovery.startsAt))} ${RECOVERY_BODY[recovery.reason]}${
            nearestFree ? ` Nearest free: ${fmtTime(Date.parse(nearestFree))}.` : ""
          }`}
          action={
            <Button size="lg" onClick={onPickAnother}>
              Pick another time
            </Button>
          }
        />
      </div>
    )
  }

  const count = state.status === "ready" ? state.slots.length : 0

  return (
    <div className="space-y-3" aria-busy={holding}>
      <h2 className="type-section-title font-semibold">Choose a time</h2>
      {selection ? (
        <p className="rounded-card border border-border bg-card px-3 py-2 type-supporting text-muted-foreground">
          {selection}
        </p>
      ) : null}
      <SlotPickerView
        date={date}
        state={state}
        onPick={onPick}
        onDateChange={onDateChange}
        minDate={minDate}
        disabled={holding}
        onRetry={onRetry}
      />
      {state.status === "ready" && count > 0 ? (
        <p className="type-body tabular-nums text-muted-foreground">
          {count} {count === 1 ? "time" : "times"} available
        </p>
      ) : null}
      {holding ? (
        <p role="status" className="type-body text-muted-foreground">
          Holding that time for you…
        </p>
      ) : null}
    </div>
  )
}
