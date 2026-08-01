import { Injectable } from "@nestjs/common"
import { AvailabilityService } from "../availability/availability.service"
import { AppException } from "../common/app.exception"
import { HoldsService, spannedSlotIndexes } from "../holds/holds.service"
import { PrismaService } from "../prisma/prisma.service"
import { currentTenant } from "../tenant/tenant-context"
import { CreateHoldDto } from "./dto/create-hold.dto"
import { QueryPublicAvailabilityDto } from "./dto/query-public-availability.dto"

const BKK_OFFSET_MS = 7 * 60 * 60_000
const DAY_MS = 24 * 60 * 60_000

export interface PublicClinic {
  id: string
  name: string
  slug: string
  branches: Array<{ id: string; name: string }>
  services: Array<{ id: string; name: string; durationMin: number; colorIndex: number }>
}

export const bkkDayWindow = (date: string): { from: number; to: number } => {
  const utcMidnight = Date.parse(`${date}T00:00:00.000Z`)
  if (Number.isNaN(utcMidnight)) {
    throw new AppException(400, "INVALID_RANGE", "date must be a valid YYYY-MM-DD date")
  }
  const from = utcMidnight - BKK_OFFSET_MS
  return { from, to: from + DAY_MS }
}

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly holds: HoldsService
  ) {}

  async clinic(): Promise<PublicClinic> {
    const ctx = currentTenant()
    if (!ctx) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")

    const [tenant, branches, services] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { id: true, name: true, slug: true }
      }),
      this.prisma.scoped.branch.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.scoped.service.findMany({
        where: { isActive: true },
        select: { id: true, name: true, durationMin: true, colorIndex: true },
        orderBy: { name: "asc" }
      })
    ])
    if (!tenant) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")

    return { ...tenant, branches, services }
  }

  async availableSlots(query: QueryPublicAvailabilityDto) {
    const window = bkkDayWindow(query.date)
    const { slots } = await this.availability.slots({
      serviceId: query.serviceId,
      branchId: query.branchId,
      from: new Date(window.from).toISOString(),
      to: new Date(window.to).toISOString(),
      dentistId: query.dentistId
    })

    const dentistIds = [...new Set(slots.map((slot) => slot.dentistId))]
    const held = await this.holds.heldSlotIndexes(
      dentistIds,
      window.from,
      window.to,
      query.exceptHoldId
    )
    if (held.size === 0) return { slots }

    return {
      slots: slots.filter((slot) => {
        const taken = held.get(slot.dentistId)
        if (!taken) return true
        const spanned = spannedSlotIndexes(Date.parse(slot.startsAt), Date.parse(slot.endsAt))
        return !spanned.some((index) => taken.has(index))
      })
    }
  }

  async createHold(body: CreateHoldDto) {
    const service = await this.prisma.scoped.service.findFirst({
      where: { id: body.serviceId, isActive: true },
      select: { durationMin: true }
    })
    if (!service) throw new AppException(404, "NOT_FOUND", "Service not found")

    const dentist = await this.prisma.scoped.user.findFirst({
      where: { id: body.dentistId, role: "dentist", isActive: true },
      select: { id: true }
    })
    if (!dentist) throw new AppException(404, "NOT_FOUND", "Dentist not found")

    const branch = await this.prisma.scoped.branch.findFirst({
      where: { id: body.branchId },
      select: { id: true }
    })
    if (!branch) throw new AppException(404, "NOT_FOUND", "Branch not found")

    return this.holds.acquire({
      serviceId: body.serviceId,
      branchId: body.branchId,
      dentistId: body.dentistId,
      startsAt: body.startsAt,
      durationMin: service.durationMin
    })
  }

  releaseHold(holdId: string): Promise<void> {
    return this.holds.release(holdId)
  }
}
