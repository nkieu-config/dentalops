import { Injectable } from "@nestjs/common"
import { Interval, ResourceUnit, computeSlots } from "@dentalops/availability"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { currentTenant } from "../tenant/tenant-context"
import { AvailabilityCache } from "./availability.cache"
import { QueryAvailabilityDto } from "./dto/query-availability.dto"

const MINUTE = 60_000
const MAX_RANGE_MS = 31 * 24 * 60 * MINUTE
const STEP_MIN = 15

const toInterval = (row: { startsAt: Date; endsAt: Date }): Interval => ({
  start: row.startsAt.getTime(),
  end: row.endsAt.getTime()
})

const toUnit = (r: { id: string; claims: { startsAt: Date; endsAt: Date }[] }): ResourceUnit => ({
  id: r.id,
  busy: r.claims.map(toInterval)
})

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AvailabilityCache
  ) {}

  async slots(q: QueryAvailabilityDto) {
    const from = Date.parse(q.from)
    const to = Date.parse(q.to)
    if (to <= from) throw new AppException(400, "INVALID_RANGE", "to must be after from")
    if (to - from > MAX_RANGE_MS) {
      throw new AppException(400, "RANGE_TOO_LARGE", "Window must be 31 days or less")
    }

    const branch = await this.prisma.scoped.branch.findFirst({
      where: { id: q.branchId, isActive: true },
      select: { id: true }
    })
    if (!branch) throw new AppException(404, "NOT_FOUND", "Branch not found")

    const tenant = currentTenant()
    const cached = tenant
      ? await this.cache.read({
          tenantId: tenant.tenantId,
          branchId: q.branchId,
          serviceId: q.serviceId,
          dentistId: q.dentistId,
          from,
          to
        })
      : null
    if (cached?.slots) return { slots: cached.slots }

    const service = await this.prisma.scoped.service.findUnique({
      where: { id: q.serviceId },
      include: { requirements: true }
    })
    if (!service) throw new AppException(404, "NOT_FOUND", "Service not found")

    const dentists = await this.prisma.scoped.user.findMany({
      where: { role: "dentist", isActive: true, ...(q.dentistId ? { id: q.dentistId } : {}) }
    })
    const dentistIds = dentists.map((d) => d.id)
    const fromDate = new Date(from)
    const toDate = new Date(to)
    const chairHorizon = new Date(to + service.bufferMin * MINUTE)

    const [shifts, blocks, appointments, chairs, equipmentUnits] = await Promise.all([
      this.prisma.scoped.shift.findMany({
        where: {
          branchId: q.branchId,
          staffId: { in: dentistIds },
          startsAt: { lt: toDate },
          endsAt: { gt: fromDate }
        }
      }),
      this.prisma.scoped.timeBlock.findMany({
        where: {
          OR: [{ staffId: { in: dentistIds } }, { staffId: null, branchId: q.branchId }],
          startsAt: { lt: toDate },
          endsAt: { gt: fromDate }
        }
      }),
      this.prisma.scoped.appointment.findMany({
        where: {
          dentistId: { in: dentistIds },
          status: "confirmed",
          startsAt: { lt: toDate },
          endsAt: { gt: fromDate }
        }
      }),
      this.prisma.scoped.resource.findMany({
        where: { branchId: q.branchId, type: "chair", isActive: true },
        include: {
          claims: {
            where: { status: "active", startsAt: { lt: chairHorizon }, endsAt: { gt: fromDate } }
          }
        }
      }),
      this.prisma.scoped.resource.findMany({
        where: {
          branchId: q.branchId,
          type: "equipment",
          isActive: true,
          equipmentTypeId: { in: service.requirements.map((r) => r.equipmentTypeId) }
        },
        include: {
          claims: {
            where: { status: "active", startsAt: { lt: toDate }, endsAt: { gt: fromDate } }
          }
        }
      })
    ])

    const computed = computeSlots({
      window: { start: from, end: to },
      stepMin: STEP_MIN,
      durationMin: service.durationMin,
      bufferMin: service.bufferMin,
      staff: dentists.map((d) => ({
        staffId: d.id,
        shifts: shifts.filter((s) => s.staffId === d.id).map(toInterval),
        busy: [
          ...appointments.filter((a) => a.dentistId === d.id).map(toInterval),
          ...blocks.filter((b) => b.staffId === d.id || b.staffId === null).map(toInterval)
        ]
      })),
      chairs: chairs.map(toUnit),
      equipmentPools: service.requirements.map((req) =>
        equipmentUnits.filter((u) => u.equipmentTypeId === req.equipmentTypeId).map(toUnit)
      )
    })

    const slots = computed.map((s) => ({
      dentistId: s.staffId,
      startsAt: new Date(s.start).toISOString(),
      endsAt: new Date(s.end).toISOString()
    }))
    if (cached?.entryKey) await this.cache.write(cached.entryKey, slots)

    return { slots }
  }
}
