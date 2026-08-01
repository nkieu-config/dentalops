import { Injectable } from "@nestjs/common"
import { Prisma, Resource, ResourceType } from "@prisma/client"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { CreateAppointmentDto } from "./dto/create-appointment.dto"
import { QueryAppointmentsDto } from "./dto/query-appointments.dto"

const EXCLUSION = /exclusion constraint \\?"(\w+)\\?"/

const APPOINTMENT_INCLUDE = {
  claims: { where: { status: "active" as const } },
  service: true,
  patient: true
} satisfies Prisma.AppointmentInclude

interface Window {
  startsAt: Date
  endsAt: Date
  chairEndsAt: Date
}

type ScopedClient = PrismaService["scoped"]
type ScopedTransactionClient = Parameters<Parameters<ScopedClient["$transaction"]>[0]>[0]

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: QueryAppointmentsDto) {
    return this.prisma.scoped.appointment.findMany({
      where: {
        branchId: query.branchId,
        dentistId: query.dentistId,
        startsAt: query.to ? { lt: new Date(query.to) } : undefined,
        endsAt: query.from ? { gt: new Date(query.from) } : undefined
      },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: "asc" }
    })
  }

  async create(dto: CreateAppointmentDto) {
    const service = await this.prisma.scoped.service.findUnique({
      where: { id: dto.serviceId },
      include: { requirements: true }
    })
    if (!service) throw new AppException(404, "NOT_FOUND", "Service not found")
    const dentist = await this.prisma.scoped.user.findFirst({
      where: { id: dto.dentistId, role: "dentist", isActive: true }
    })
    if (!dentist) throw new AppException(404, "NOT_FOUND", "Dentist not found")
    const branch = await this.prisma.scoped.branch.findUnique({ where: { id: dto.branchId } })
    if (!branch) throw new AppException(404, "NOT_FOUND", "Branch not found")
    const patient = await this.prisma.scoped.patient.findUnique({ where: { id: dto.patientId } })
    if (!patient) throw new AppException(404, "NOT_FOUND", "Patient not found")

    const startsAt = new Date(dto.startsAt)
    const win: Window = {
      startsAt,
      endsAt: new Date(startsAt.getTime() + service.durationMin * 60_000),
      chairEndsAt: new Date(
        startsAt.getTime() + (service.durationMin + service.bufferMin) * 60_000
      )
    }

    return this.withResourceRetry(() => this.attemptCreate(dto, service.requirements, win))
  }

  async withResourceRetry<T>(attempt: () => Promise<T>): Promise<T> {
    for (let i = 0; i < 4; i++) {
      try {
        return await attempt()
      } catch (e) {
        const constraint = e instanceof Error ? e.message.match(EXCLUSION)?.[1] : undefined
        if (constraint === "no_dentist_overlap") {
          throw new AppException(409, "SLOT_CONFLICT", "Dentist is already booked at this time", {
            constraint
          })
        }
        if (constraint === "no_resource_overlap") continue
        throw e
      }
    }
    throw new AppException(409, "RESOURCE_UNAVAILABLE", "No free chair or equipment at this time")
  }

  private attemptCreate(
    dto: CreateAppointmentDto,
    requirements: { equipmentTypeId: string }[],
    win: Window
  ) {
    return this.prisma.scoped.$transaction(async (tx) => {
      const claims = await this.pickResources(tx, dto.branchId, requirements, win)
      const appointment = await tx.appointment.create({
        data: {
          branchId: dto.branchId,
          serviceId: dto.serviceId,
          dentistId: dto.dentistId,
          patientId: dto.patientId,
          startsAt: win.startsAt,
          endsAt: win.endsAt
        } as never
      })
      for (const claim of claims) {
        await tx.resourceClaim.create({
          data: { appointmentId: appointment.id, ...claim } as never
        })
      }
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: APPOINTMENT_INCLUDE
      })
    })
  }

  async pickResources(
    tx: ScopedTransactionClient,
    branchId: string,
    requirements: { equipmentTypeId: string }[],
    win: Window
  ) {
    const chair = await this.findFreeResource(tx, branchId, "chair", null, win.startsAt, win.chairEndsAt)
    if (!chair) {
      throw new AppException(409, "RESOURCE_UNAVAILABLE", "No free chair at this time")
    }
    const claims = [{ resourceId: chair.id, startsAt: win.startsAt, endsAt: win.chairEndsAt }]
    for (const req of requirements) {
      const unit = await this.findFreeResource(
        tx,
        branchId,
        "equipment",
        req.equipmentTypeId,
        win.startsAt,
        win.endsAt
      )
      if (!unit) {
        throw new AppException(409, "RESOURCE_UNAVAILABLE", "Required equipment is not free")
      }
      claims.push({ resourceId: unit.id, startsAt: win.startsAt, endsAt: win.endsAt })
    }
    return claims.sort((a, b) => a.resourceId.localeCompare(b.resourceId))
  }

  private async findFreeResource(
    tx: ScopedTransactionClient,
    branchId: string,
    type: ResourceType,
    equipmentTypeId: string | null,
    startsAt: Date,
    endsAt: Date
  ): Promise<Resource | null> {
    const candidates = await tx.resource.findMany({
      where: {
        branchId,
        type,
        isActive: true,
        ...(equipmentTypeId ? { equipmentTypeId } : {})
      },
      orderBy: { name: "asc" }
    })
    if (candidates.length === 0) return null
    const busy = await tx.resourceClaim.findMany({
      where: {
        resourceId: { in: candidates.map((c) => c.id) },
        status: "active",
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt }
      },
      select: { resourceId: true }
    })
    const busyIds = new Set(busy.map((b) => b.resourceId))
    return candidates.find((c) => !busyIds.has(c.id)) ?? null
  }
}
