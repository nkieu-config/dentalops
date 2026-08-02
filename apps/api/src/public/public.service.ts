import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { AppointmentsService } from "../appointments/appointments.service"
import { AvailabilityService } from "../availability/availability.service"
import { AppException } from "../common/app.exception"
import { HoldsService, spannedSlotIndexes } from "../holds/holds.service"
import { MailQueue } from "../mail/mail.queue"
import { PrismaService } from "../prisma/prisma.service"
import { currentTenant } from "../tenant/tenant-context"
import { ConfirmBookingDto } from "./dto/confirm-booking.dto"
import { CreateHoldDto } from "./dto/create-hold.dto"
import { QueryPublicAvailabilityDto } from "./dto/query-public-availability.dto"
import { ManageTokenService } from "./manage-token.service"

const BKK_OFFSET_MS = 7 * 60 * 60_000
const DAY_MS = 24 * 60 * 60_000

const PUBLIC_APPOINTMENT_SELECT = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  branch: { select: { id: true, name: true } },
  service: { select: { id: true, name: true, durationMin: true } },
  dentist: { select: { id: true, name: true } },
  patient: { select: { id: true, name: true } }
} satisfies Prisma.AppointmentSelect

export interface PublicClinic {
  id: string
  name: string
  slug: string
  branches: Array<{ id: string; name: string }>
  services: Array<{ id: string; name: string; durationMin: number; colorIndex: number }>
  dentists: Array<{ id: string; name: string }>
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
    private readonly holds: HoldsService,
    private readonly appointments: AppointmentsService,
    private readonly manageTokens: ManageTokenService,
    private readonly mail: MailQueue
  ) {}

  async clinic(): Promise<PublicClinic> {
    const ctx = currentTenant()
    if (!ctx) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")

    const [tenant, branches, services, dentists] = await Promise.all([
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
      }),
      this.prisma.scoped.user.findMany({
        where: { role: "dentist", isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      })
    ])
    if (!tenant) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")

    return { ...tenant, branches, services, dentists }
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

  async confirm(body: ConfirmBookingDto) {
    const ctx = currentTenant()
    if (!ctx) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")

    const hold = await this.holds.read(body.holdId)
    if (!hold || hold.tenantId !== ctx.tenantId) {
      throw new AppException(409, "HOLD_EXPIRED", "That time is no longer held for you")
    }

    const patient = await this.upsertPatient(ctx.tenantId, body)
    const created = await this.appointments.create({
      serviceId: hold.serviceId,
      branchId: hold.branchId,
      dentistId: hold.dentistId,
      patientId: patient.id,
      startsAt: hold.startsAt
    })
    await this.holds.release(body.holdId)

    const manageToken = await this.manageTokens.sign(created.id)
    await this.mail.enqueueConfirmation({
      appointmentId: created.id,
      tenantId: ctx.tenantId,
      manageToken
    })

    return { appointment: await this.appointmentView(created.id), manageToken }
  }

  async manageView(token: string) {
    const claims = await this.manageTokens.verify(token)
    return this.appointmentView(claims.sub)
  }

  async manageCancel(token: string) {
    const claims = await this.manageTokens.verify(token)
    await this.appointments.setStatus(claims.sub, { status: "cancelled" })
  }

  private upsertPatient(tenantId: string, body: ConfirmBookingDto) {
    return this.prisma.scoped.patient.upsert({
      where: { tenantId_phone: { tenantId, phone: body.phone } },
      create: { tenantId, name: body.name, phone: body.phone, email: body.email ?? "" },
      update: {},
      select: { id: true }
    })
  }

  private async appointmentView(id: string) {
    const appointment = await this.prisma.scoped.appointment.findUnique({
      where: { id },
      select: PUBLIC_APPOINTMENT_SELECT
    })
    if (!appointment) throw new AppException(404, "NOT_FOUND", "Appointment not found")
    return appointment
  }
}
