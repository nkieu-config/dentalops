import { Injectable } from "@nestjs/common"
import {
  validateRoster,
  type RosterAppointment,
  type RosterShift,
  type RosterStaff,
  type Violation
} from "@dentalops/availability"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { ValidateRosterDto } from "./dto/validate-roster.dto"

const MAX_RANGE_MS = 31 * 24 * 60 * 60_000

interface TimedRow {
  id: string
  startsAt: Date
  endsAt: Date
}

const toShift = (row: TimedRow): RosterShift => ({
  id: row.id,
  start: row.startsAt.getTime(),
  end: row.endsAt.getTime()
})

const toAppointment = (row: TimedRow): RosterAppointment => ({
  id: row.id,
  start: row.startsAt.getTime(),
  end: row.endsAt.getTime()
})

@Injectable()
export class RosterService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(dto: ValidateRosterDto): Promise<{ violations: Violation[] }> {
    const from = Date.parse(dto.from)
    const to = Date.parse(dto.to)
    if (to <= from) throw new AppException(400, "INVALID_RANGE", "to must be after from")
    if (to - from > MAX_RANGE_MS) {
      throw new AppException(400, "RANGE_TOO_LARGE", "Window must be 31 days or less")
    }

    const fromDate = new Date(from)
    const toDate = new Date(to)

    const [shifts, appointments] = await Promise.all([
      this.prisma.scoped.shift.findMany({
        where: { branchId: dto.branchId, startsAt: { lt: toDate }, endsAt: { gt: fromDate } },
        select: { id: true, staffId: true, startsAt: true, endsAt: true }
      }),
      this.prisma.scoped.appointment.findMany({
        where: {
          branchId: dto.branchId,
          status: "confirmed",
          startsAt: { lt: toDate },
          endsAt: { gt: fromDate }
        },
        select: { id: true, dentistId: true, startsAt: true, endsAt: true }
      })
    ])

    const drafted = new Map<string, RosterShift[]>()
    for (const [index, draft] of dto.draftShifts.entries()) {
      const forStaff = drafted.get(draft.staffId) ?? []
      forStaff.push({
        id: draft.id ?? `draft-${index}`,
        start: Date.parse(draft.startsAt),
        end: Date.parse(draft.endsAt)
      })
      drafted.set(draft.staffId, forStaff)
    }

    const staffIds = [...new Set([...shifts.map((s) => s.staffId), ...drafted.keys()])].sort()

    const staff: RosterStaff[] = staffIds.map((staffId) => ({
      staffId,
      shifts: drafted.get(staffId) ?? shifts.filter((s) => s.staffId === staffId).map(toShift),
      appointments: appointments.filter((a) => a.dentistId === staffId).map(toAppointment)
    }))

    return { violations: validateRoster({ staff }) }
  }
}
