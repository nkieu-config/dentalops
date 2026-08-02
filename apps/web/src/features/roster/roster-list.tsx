import type { Shift, StaffMember } from "@dentalops/contracts"
import { fmtWeekday } from "./hooks"
import { ShiftBlock } from "./shift-block"

interface RosterListProps {
  staff: StaffMember[]
  dates: string[]
  shiftsOn: (staffId: string, date: string) => Shift[]
  blockedStaff: ReadonlySet<string>
  onEdit: (shift: Shift) => void
}

export const RosterList = ({
  staff,
  dates,
  shiftsOn,
  blockedStaff,
  onEdit
}: RosterListProps) => (
  <div className="min-h-0 flex-1 overflow-y-auto" data-testid="roster-list">
    {staff.map((member) => {
      const days = dates
        .map((date) => ({ date, shifts: shiftsOn(member.id, date) }))
        .filter((day) => day.shifts.length > 0)
      return (
        <section key={member.id} className="border-b border-border p-3">
          <h2 className="mb-2 text-sm font-semibold">{member.name}</h2>
          {days.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shifts this week</p>
          ) : (
            <ul className="space-y-2">
              {days.map((day) => (
                <li key={day.date} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-sm text-muted-foreground tabular-nums">
                    {fmtWeekday(day.date)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {day.shifts.map((shift) => (
                      <ShiftBlock
                        key={shift.id}
                        shift={shift}
                        staffName={member.name}
                        onEdit={onEdit}
                        conflicting={blockedStaff.has(member.id)}
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
