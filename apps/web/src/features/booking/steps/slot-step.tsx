import { TimerOff } from "lucide-react"
import { SlotPickerView, type SlotPickerState } from "../../../components/slot-picker"
import { Button } from "../../../components/ui/button"
import { fmtTime } from "../../timeline/lib/geometry"
import type { WizardRecovery } from "../wizard-reducer"

interface SlotStepProps {
  date: string
  state: SlotPickerState
  recovery: WizardRecovery | null
  nearestFree: string | null
  holding: boolean
  onPick: (startsAtIso: string) => void
  onDateChange: (isoDate: string) => void
  onPickAnother: () => void
}

const RECOVERY_TITLE: Record<WizardRecovery["reason"], string> = {
  expired: "Your hold expired",
  taken: "That time was just booked"
}

export const SlotStep = ({
  date,
  state,
  recovery,
  nearestFree,
  holding,
  onPick,
  onDateChange,
  onPickAnother
}: SlotStepProps) => {
  if (recovery) {
    return (
      <div
        data-testid="hold-recovery"
        className="flex flex-col items-center gap-3 rounded-md border border-border py-10 text-center"
      >
        <TimerOff className="h-8 w-8 text-warning" aria-hidden />
        <h2 className="text-lg font-semibold">{RECOVERY_TITLE[recovery.reason]}</h2>
        <p className="text-base tabular-nums text-muted-foreground">
          {fmtTime(Date.parse(recovery.startsAt))} was taken.
        </p>
        {nearestFree ? (
          <p className="text-base tabular-nums">
            Nearest free: <strong>{fmtTime(Date.parse(nearestFree))}</strong>
          </p>
        ) : null}
        <Button className="min-h-11 px-6 text-base" onClick={onPickAnother}>
          Pick another time
        </Button>
      </div>
    )
  }

  const count = state.status === "ready" ? state.slots.length : 0

  return (
    <div className="space-y-3" aria-busy={holding}>
      <h2 className="text-lg font-semibold">Choose a time</h2>
      <SlotPickerView date={date} state={state} onPick={onPick} onDateChange={onDateChange} />
      {state.status === "ready" && count > 0 ? (
        <p className="text-base tabular-nums text-muted-foreground">
          {count} {count === 1 ? "time" : "times"} available
        </p>
      ) : null}
      {holding ? (
        <p role="status" className="text-base text-muted-foreground">
          Holding that time for you…
        </p>
      ) : null}
    </div>
  )
}
