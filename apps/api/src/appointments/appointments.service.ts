import { Injectable } from "@nestjs/common"
import { AppointmentStatus, Prisma, Resource, ResourceType } from "@prisma/client"
import { auditActor, AuditService } from "../audit/audit.service"
import { AvailabilityCache } from "../availability/availability.cache"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { AppointmentAction } from "../realtime/realtime.events"
import { RealtimeGateway } from "../realtime/realtime.gateway"
import { currentTenant } from "../tenant/tenant-context"
import { CreateAppointmentDto } from "./dto/create-appointment.dto"
import { QueryAppointmentsDto } from "./dto/query-appointments.dto"
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto"
import { SetStatusDto } from "./dto/set-status.dto"

const EXCLUSION = /exclusion constraint \\?"(\w+)\\?"/
const RETRYABLE_SQLSTATE = /code: "(40P01|40001)"/

export const APPOINTMENT_INCLUDE = {
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly cache: AvailabilityCache,
    private readonly audit: AuditService
  ) {}

  private announce(
    appointment: { id: string; tenantId: string; branchId: string },
    action: AppointmentAction
  ) {
    this.realtime.appointmentChanged({
      appointmentId: appointment.id,
      tenantId: appointment.tenantId,
      branchId: appointment.branchId,
      action
    })
  }

  list(query: QueryAppointmentsDto) {
    const actor = currentTenant()
    const dentistId = actor?.role === "dentist" ? actor.userId : query.dentistId
    return this.prisma.scoped.appointment.findMany({
      where: {
        branchId: query.branchId,
        dentistId,
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
    const branch = await this.prisma.scoped.branch.findFirst({
      where: { id: dto.branchId, isActive: true }
    })
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

    const created = await this.withConflictIdentity(
      () => this.withResourceRetry(() => this.attemptCreate(dto, service.requirements, win)),
      () => this.findDentistConflict(dto.dentistId, win.startsAt, win.endsAt)
    )
    await this.cache.invalidateWindows(created.tenantId, [created])
    this.announce(created, "created")
    return created
  }

  private findDentistConflict(
    dentistId: string,
    startsAt: Date,
    endsAt: Date,
    excludeId?: string
  ): Promise<{ id: string } | null> {
    return this.prisma.scoped.appointment.findFirst({
      where: {
        dentistId,
        status: "confirmed",
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        ...(excludeId ? { id: { not: excludeId } } : {})
      },
      orderBy: { startsAt: "asc" },
      select: { id: true }
    })
  }

  private async withConflictIdentity<T>(
    fn: () => Promise<T>,
    locate: () => Promise<{ id: string } | null>
  ): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      if (e instanceof AppException) {
        const body = e.getResponse() as {
          errorCode?: string
          message?: string
          details?: unknown
        }
        if (body.errorCode === "SLOT_CONFLICT") {
          const conflict = await locate()
          throw new AppException(409, "SLOT_CONFLICT", body.message ?? "Slot conflict", {
            ...(typeof body.details === "object" && body.details !== null ? body.details : {}),
            ...(conflict ? { conflictingAppointmentId: conflict.id } : {})
          })
        }
      }
      throw e
    }
  }

  async withResourceRetry<T>(attempt: () => Promise<T>): Promise<T> {
    for (let i = 0; i < 8; i++) {
      try {
        return await attempt()
      } catch (e) {
        const message = e instanceof Error ? e.message : ""
        const constraint = message.match(EXCLUSION)?.[1]
        if (constraint === "no_dentist_overlap") {
          throw new AppException(409, "SLOT_CONFLICT", "Dentist is already booked at this time", {
            constraint
          })
        }
        if (constraint === "no_resource_overlap") continue
        if (RETRYABLE_SQLSTATE.test(message)) continue
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
      await this.lockDentist(tx, dto.dentistId)
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
      const claims = await this.pickResources(tx, dto.branchId, requirements, win)
      await tx.resourceClaim.createMany({
        data: claims.map((claim) => ({ appointmentId: appointment.id, ...claim })) as never
      })
      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
        include: APPOINTMENT_INCLUDE
      })
    })
  }

  async lockDentist(tx: ScopedTransactionClient, dentistId: string) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${dentistId}::uuid FOR UPDATE`
  }

  private async lockResource(tx: ScopedTransactionClient, resourceId: string) {
    await tx.$queryRaw`SELECT id FROM resources WHERE id = ${resourceId}::uuid FOR UPDATE`
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
    const ordered = claims.sort((a, b) => a.resourceId.localeCompare(b.resourceId))
    for (const claim of ordered) {
      await this.lockResource(tx, claim.resourceId)
    }
    return ordered
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

  async reschedule(id: string, dto: RescheduleAppointmentDto) {
    const before = await this.prisma.scoped.appointment.findUnique({
      where: { id },
      select: { startsAt: true, endsAt: true }
    })
    const updated = await this.withConflictIdentity(
      () => this.attemptReschedule(id, dto),
      async () => {
        const current = await this.prisma.scoped.appointment.findUnique({ where: { id } })
        if (!current) return null
        const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt
        const durationMs = dto.durationMin
          ? dto.durationMin * 60_000
          : current.endsAt.getTime() - current.startsAt.getTime()
        return this.findDentistConflict(
          dto.dentistId ?? current.dentistId,
          startsAt,
          new Date(startsAt.getTime() + durationMs),
          id
        )
      }
    )
    await this.cache.invalidateWindows(
      updated.tenantId,
      before ? [before, updated] : [updated]
    )
    this.announce(updated, "rescheduled")
    return updated
  }

  private attemptReschedule(id: string, dto: RescheduleAppointmentDto) {
    return this.withResourceRetry(() =>
      this.prisma.scoped.$transaction(async (tx) => {
        const current = await tx.appointment.findUnique({
          where: { id },
          include: { service: { include: { requirements: true } } }
        })
        if (!current) throw new AppException(404, "NOT_FOUND", "Appointment not found")
        if (current.status !== "confirmed") {
          throw new AppException(409, "NOT_CONFIRMED", "Only confirmed appointments can move")
        }

        const startsAt = dto.startsAt ? new Date(dto.startsAt) : current.startsAt
        const dentistId = dto.dentistId ?? current.dentistId
        const durationMin =
          dto.durationMin ??
          Math.round((current.endsAt.getTime() - current.startsAt.getTime()) / 60_000)
        const win = {
          startsAt,
          endsAt: new Date(startsAt.getTime() + durationMin * 60_000),
          chairEndsAt: new Date(
            startsAt.getTime() + (durationMin + current.service.bufferMin) * 60_000
          )
        }

        await this.lockDentist(tx, dentistId)
        const updated = await tx.appointment.updateMany({
          where: { id, version: dto.version },
          data: {
            startsAt: win.startsAt,
            endsAt: win.endsAt,
            dentistId,
            version: { increment: 1 }
          }
        })
        if (updated.count === 0) {
          throw new AppException(409, "STALE_VERSION", "Appointment was changed by someone else", {
            currentVersion: current.version
          })
        }

        await tx.resourceClaim.updateMany({
          where: { appointmentId: id, status: "active" },
          data: { status: "released" }
        })
        const claims = await this.pickResources(
          tx,
          current.branchId,
          current.service.requirements,
          win
        )
        await tx.resourceClaim.createMany({
          data: claims.map((claim) => ({ appointmentId: id, ...claim })) as never
        })
        return tx.appointment.findUniqueOrThrow({
          where: { id },
          include: APPOINTMENT_INCLUDE
        })
      })
    )
  }

  async setStatus(id: string, dto: SetStatusDto) {
    let statusBefore: AppointmentStatus | undefined
    const updated = await this.prisma.scoped.$transaction(async (tx) => {
      const current = await tx.appointment.findUnique({ where: { id } })
      if (!current) throw new AppException(404, "NOT_FOUND", "Appointment not found")
      const actor = currentTenant()
      if (actor?.role === "dentist" && current.dentistId !== actor.userId) {
        throw new AppException(
          403,
          "NOT_YOUR_APPOINTMENT",
          "A dentist may only change the status of their own appointments"
        )
      }
      if (current.status !== "confirmed") {
        throw new AppException(
          409,
          "INVALID_TRANSITION",
          `Cannot ${dto.status} a ${current.status} appointment`
        )
      }
      statusBefore = current.status
      await tx.appointment.update({
        where: { id },
        data: { status: dto.status, version: { increment: 1 } }
      })
      if (dto.status === "cancelled") {
        await tx.resourceClaim.updateMany({
          where: { appointmentId: id, status: "active" },
          data: { status: "released" }
        })
      }
      return tx.appointment.findUniqueOrThrow({ where: { id }, include: APPOINTMENT_INCLUDE })
    })
    this.audit.record({
      tenantId: updated.tenantId,
      actor: auditActor(),
      action: "appointment.status",
      entity: { type: "appointment", id: updated.id },
      before: { status: statusBefore },
      after: { status: updated.status },
      requestId: ""
    })
    await this.cache.invalidateWindows(updated.tenantId, [updated])
    this.announce(updated, "status")
    return updated
  }
}
