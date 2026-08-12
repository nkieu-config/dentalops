import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import type { OpeningHours } from "@dentalops/contracts"
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
import { RescheduleByTokenDto } from "./dto/reschedule-by-token.dto"
import { ManageTokenService } from "./manage-token.service"

const BKK_OFFSET_MS = 7 * 60 * 60_000
const DAY_MS = 24 * 60 * 60_000

const PUBLIC_APPOINTMENT_SELECT = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  tenant: { select: { id: true, name: true, slug: true } },
  branch: { select: { id: true, name: true } },
  service: { select: { id: true, name: true, durationMin: true } },
  dentist: { select: { id: true, name: true } },
  patient: { select: { id: true, name: true } }
} satisfies Prisma.AppointmentSelect

interface PublicSlot {
  dentistId: string
  startsAt: string
  endsAt: string
}

export interface PublicClinic {
  id: string
  name: string
  slug: string
  branches: Array<{ id: string; name: string; timezone: string; openingHours: OpeningHours }>
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

const isLighterLoad = (
  candidate: PublicSlot,
  incumbent: PublicSlot,
  bookedMinutes: Map<string, number>
): boolean => {
  const candidateLoad = bookedMinutes.get(candidate.dentistId) ?? 0
  const incumbentLoad = bookedMinutes.get(incumbent.dentistId) ?? 0
  if (candidateLoad !== incumbentLoad) return candidateLoad < incumbentLoad
  return candidate.dentistId < incumbent.dentistId
}

export const leastBookedPerStart = (
  slots: PublicSlot[],
  bookedMinutes: Map<string, number>
): PublicSlot[] => {
  const chosen = new Map<string, PublicSlot>()
  for (const slot of slots) {
    const incumbent = chosen.get(slot.startsAt)
    if (!incumbent || isLighterLoad(slot, incumbent, bookedMinutes)) {
      chosen.set(slot.startsAt, slot)
    }
  }
  return [...chosen.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
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
        where: { isActive: true },
        select: { id: true, name: true, timezone: true, openingHours: true },
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

    return {
      ...tenant,
      branches: branches.map((branch) => ({
        ...branch,
        openingHours: branch.openingHours as OpeningHours
      })),
      services,
      dentists
    }
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
    const free =
      held.size === 0
        ? slots
        : slots.filter((slot) => {
            const taken = held.get(slot.dentistId)
            if (!taken) return true
            const spanned = spannedSlotIndexes(Date.parse(slot.startsAt), Date.parse(slot.endsAt))
            return !spanned.some((index) => taken.has(index))
          })

    if (query.dentistId) return { slots: free }
    return { slots: await this.assignLeastBookedDentist(free, window) }
  }

  private async assignLeastBookedDentist(
    slots: PublicSlot[],
    window: { from: number; to: number }
  ): Promise<PublicSlot[]> {
    const dentistIds = [...new Set(slots.map((slot) => slot.dentistId))]
    if (dentistIds.length < 2) return slots
    return leastBookedPerStart(slots, await this.bookedMinutesByDentist(dentistIds, window))
  }

  private async bookedMinutesByDentist(
    dentistIds: string[],
    window: { from: number; to: number }
  ): Promise<Map<string, number>> {
    const booked = await this.prisma.scoped.appointment.findMany({
      where: {
        dentistId: { in: dentistIds },
        status: "confirmed",
        startsAt: { lt: new Date(window.to) },
        endsAt: { gt: new Date(window.from) }
      },
      select: { dentistId: true, startsAt: true, endsAt: true }
    })

    const minutes = new Map<string, number>(dentistIds.map((id) => [id, 0]))
    for (const appointment of booked) {
      const start = Math.max(appointment.startsAt.getTime(), window.from)
      const end = Math.min(appointment.endsAt.getTime(), window.to)
      minutes.set(
        appointment.dentistId,
        (minutes.get(appointment.dentistId) ?? 0) + (end - start) / 60_000
      )
    }
    return minutes
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
      where: { id: body.branchId, isActive: true },
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
      manageToken,
      patientName: body.name,
      patientEmail: body.email
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

  async manageReschedule(token: string, body: RescheduleByTokenDto) {
    const claims = await this.manageTokens.verify(token)
    const hold = await this.holds.read(body.holdId)
    if (!hold || hold.tenantId !== claims.tenantId) {
      throw new AppException(409, "HOLD_EXPIRED", "That time is no longer held for you")
    }

    const current = await this.prisma.scoped.appointment.findUnique({
      where: { id: claims.sub },
      select: { version: true, status: true }
    })
    if (!current) throw new AppException(404, "NOT_FOUND", "Appointment not found")
    if (current.status !== "confirmed") {
      throw new AppException(
        409,
        "INVALID_TRANSITION",
        `Cannot reschedule a ${current.status} appointment`
      )
    }

    await this.appointments.reschedule(claims.sub, {
      version: current.version,
      startsAt: hold.startsAt,
      dentistId: hold.dentistId
    })
    await this.holds.release(body.holdId)
    return this.appointmentView(claims.sub)
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
    const { tenant, ...rest } = appointment
    return { ...rest, clinic: tenant }
  }
}
