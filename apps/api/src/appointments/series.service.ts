import { Injectable } from "@nestjs/common"
import { Interval, expandRecurrence } from "@dentalops/availability"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { APPOINTMENT_INCLUDE, AppointmentsService } from "./appointments.service"
import { CreateSeriesDto } from "./dto/create-series.dto"

const MINUTE = 60_000
const DAY = 86_400_000
const BANGKOK_OFFSET_MIN = 420
const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 10_000 }
const CONFLICT_CODES = new Set(["SLOT_CONFLICT", "RESOURCE_UNAVAILABLE"])

type ScopedClient = PrismaService["scoped"]
type ScopedTransactionClient = Parameters<Parameters<ScopedClient["$transaction"]>[0]>[0]

interface SeriesConflict {
  startsAt: string
  reason: string
}

interface OccurrencePlan {
  branchId: string
  serviceId: string
  dentistId: string
  patientId: string
  seriesId: string
  bufferMin: number
  requirements: { equipmentTypeId: string }[]
}

const conflictReason = (error: unknown): string | null => {
  if (!(error instanceof AppException)) return null
  const body = error.getResponse() as { errorCode?: string }
  const code = body.errorCode ?? ""
  return CONFLICT_CODES.has(code) ? code : null
}

@Injectable()
export class SeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService
  ) {}

  async create(dto: CreateSeriesDto) {
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

    const occurrences = this.expand(dto, service.durationMin)

    const seriesId = await this.prisma.scoped.$transaction(async (tx) => {
      await this.appointments.lockDentist(tx, dto.dentistId)
      const series = await tx.appointmentSeries.create({
        data: {
          freq: dto.freq,
          interval: dto.interval,
          byWeekday: dto.byWeekday,
          count: dto.count
        } as never
      })
      const plan: OccurrencePlan = {
        branchId: dto.branchId,
        serviceId: dto.serviceId,
        dentistId: dto.dentistId,
        patientId: dto.patientId,
        seriesId: series.id,
        bufferMin: service.bufferMin,
        requirements: service.requirements
      }
      const conflicts: SeriesConflict[] = []
      for (const [index, occurrence] of occurrences.entries()) {
        try {
          await this.appointments.withResourceRetry(() =>
            this.attemptOccurrence(tx, index, plan, occurrence)
          )
        } catch (error) {
          const reason = conflictReason(error)
          if (!reason) throw error
          conflicts.push({ startsAt: new Date(occurrence.start).toISOString(), reason })
        }
      }
      if (conflicts.length > 0) {
        throw new AppException(409, "SERIES_CONFLICT", "Some occurrences conflict", { conflicts })
      }
      return series.id
    }, TRANSACTION_OPTIONS)

    const appointments = await this.prisma.scoped.appointment.findMany({
      where: { seriesId },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: "asc" }
    })
    return { seriesId, appointments }
  }

  private expand(dto: CreateSeriesDto, durationMin: number): Interval[] {
    const startsAt = Date.parse(dto.startsAt)
    const local = startsAt + BANGKOK_OFFSET_MIN * MINUTE
    const dayIndex = Math.floor(local / DAY)
    return expandRecurrence(
      {
        freq: dto.freq,
        interval: dto.interval,
        byWeekday: dto.byWeekday,
        timeStartMin: Math.floor((local - dayIndex * DAY) / MINUTE),
        durationMin,
        startsOn: new Date(dayIndex * DAY).toISOString().slice(0, 10),
        count: dto.count
      },
      { start: startsAt, end: Number.POSITIVE_INFINITY }
    )
  }

  private async attemptOccurrence(
    tx: ScopedTransactionClient,
    index: number,
    plan: OccurrencePlan,
    occurrence: Interval
  ): Promise<string> {
    const win = {
      startsAt: new Date(occurrence.start),
      endsAt: new Date(occurrence.end),
      chairEndsAt: new Date(occurrence.end + plan.bufferMin * MINUTE)
    }
    const savepoint = `occ_${index.toFixed(0)}`
    await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
    try {
      const appointment = await tx.appointment.create({
        data: {
          branchId: plan.branchId,
          serviceId: plan.serviceId,
          dentistId: plan.dentistId,
          patientId: plan.patientId,
          seriesId: plan.seriesId,
          startsAt: win.startsAt,
          endsAt: win.endsAt
        } as never
      })
      const claims = await this.appointments.pickResources(tx, plan.branchId, plan.requirements, win)
      for (const claim of claims) {
        await tx.resourceClaim.create({
          data: { appointmentId: appointment.id, ...claim } as never
        })
      }
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
      return appointment.id
    } catch (error) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
      throw error
    }
  }
}
