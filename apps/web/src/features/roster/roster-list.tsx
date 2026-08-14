import type { Shift, StaffMember } from "@dentalops/contracts"
import { Plus } from "lucide-react"
import { Button } from "../../components/ui/button"
import { fmtWeekday } from "./hooks"
import { ShiftBlock } from "./shift-block"

interface RosterListProps {
  staff: StaffMember[]
  dates: string[]
  shiftsOn: (staffId: string, date: string) => Shift[]
  conflictingShiftIds: ReadonlySet<string>
  onEdit: (shift: Shift) => void
  onAdd: (staffId: string) => void
}

export const RosterList = ({
  staff,
  dates,
  shiftsOn,
  conflictingShiftIds,
  onEdit,
  onAdd
}: RosterListProps) => (
  <div
    className="min-h-0 flex-1 overflow-y-auto rounded-timeline-shell border border-border bg-card"
    data-testid="roster-list"
  >
    {staff.map((member) => {
      const days = dates
        .map((date) => ({ date, shifts: shiftsOn(member.id, date) }))
        .filter((day) => day.shifts.length > 0)
      return (
        <section key={member.id} className="border-b border-border p-3">
          <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
            <h2 className="type-ui font-semibold">{member.name}</h2>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              aria-label={`Add shift for ${member.name}`}
              onClick={() => onAdd(member.id)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add shift
            </Button>
          </div>
          {days.length === 0 ? (
            <p className="type-ui text-muted-foreground">No shifts this week</p>
          ) : (
            <ul className="space-y-2">
              {days.map((day) => (
                <li key={day.date} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 type-ui text-muted-foreground tabular-nums">
                    {fmtWeekday(day.date)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {day.shifts.map((shift) => (
                      <ShiftBlock
                        key={shift.id}
                        shift={shift}
                        staffName={member.name}
                        onEdit={onEdit}
                        conflicting={conflictingShiftIds.has(shift.id)}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )
    })}
  </div>
)
