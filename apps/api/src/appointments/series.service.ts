import { Injectable } from "@nestjs/common"
import { Interval, expandRecurrence } from "@dentalops/availability"
import { Appointment, Prisma } from "@prisma/client"
import { AvailabilityCache } from "../availability/availability.cache"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { scoped } from "../prisma/scoped-input"
import { APPOINTMENT_INCLUDE, AppointmentsService } from "./appointments.service"
import { CreateSeriesDto } from "./dto/create-series.dto"
import { EditSeriesDto } from "./dto/edit-series.dto"

const MINUTE = 60_000
const DAY = 86_400_000
const BANGKOK_OFFSET_MIN = 420
const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 10_000 }
const CONFLICT_CODES = new Set(["SLOT_CONFLICT", "RESOURCE_UNAVAILABLE"])

type ScopedClient = PrismaService["scoped"]
type ScopedTransactionClient = Parameters<Parameters<ScopedClient["$transaction"]>[0]>[0]

type OccurrenceWithService = Prisma.AppointmentGetPayload<{
  include: { service: { include: { requirements: true } } }
}>

interface SeriesConflict {
  startsAt: string
  reason: string
}

interface OccurrenceWindow {
  startsAt: Date
  endsAt: Date
  chairEndsAt: Date
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

interface MoveTarget extends OccurrenceWindow {
  current: OccurrenceWithService
  dentistId: string
}

const conflictReason = (error: unknown): string | null => {
  if (!(error instanceof AppException)) return null
  const body = error.getResponse() as { errorCode?: string }
  const code = body.errorCode ?? ""
  return CONFLICT_CODES.has(code) ? code : null
}

const bangkokWeekday = (ms: number): number =>
  new Date(ms + BANGKOK_OFFSET_MIN * MINUTE).getUTCDay()

@Injectable()
export class SeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly cache: AvailabilityCache
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
    const branch = await this.prisma.scoped.branch.findFirst({
      where: { id: dto.branchId, isActive: true }
    })
    if (!branch) throw new AppException(404, "NOT_FOUND", "Branch not found")
    const patient = await this.prisma.scoped.patient.findUnique({ where: { id: dto.patientId } })
    if (!patient) throw new AppException(404, "NOT_FOUND", "Patient not found")

    const occurrences = this.expand(dto, service.durationMin)

    const seriesId = await this.prisma.scoped.$transaction(async (tx) => {
      await this.appointments.lockDentist(tx, dto.dentistId)
      const series = await tx.appointmentSeries.create({
        data: scoped<Prisma.AppointmentSeriesUncheckedCreateInput>({
          freq: dto.freq,
          interval: dto.interval,
          byWeekday: dto.byWeekday,
          count: dto.count
        })
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
      const windows = occurrences.map((occurrence) => this.windowOf(occurrence, plan.bufferMin))
      await this.eachOccurrence(tx, windows, (win) => this.insertOccurrence(tx, plan, win))
      return series.id
    }, TRANSACTION_OPTIONS)

    const appointments = await this.listSeries(seriesId)
    const first = appointments[0]
    if (first) await this.cache.invalidateWindows(first.tenantId, appointments)

    return { seriesId, appointments }
  }

  async edit(id: string, dto: EditSeriesDto) {
    const series = await this.prisma.scoped.appointmentSeries.findUnique({ where: { id } })
    if (!series) throw new AppException(404, "NOT_FOUND", "Series not found")
    const anchor = await this.prisma.scoped.appointment.findFirst({
      where: { id: dto.fromAppointmentId, seriesId: id }
    })
    if (!anchor) throw new AppException(404, "NOT_FOUND", "Occurrence not found in this series")

    if (dto.scope === "this") {
      await this.appointments.reschedule(anchor.id, {
        version: dto.version ?? anchor.version,
        startsAt: dto.startsAt,
        dentistId: dto.dentistId,
        durationMin: dto.durationMin
      })
      await this.prisma.scoped.appointment.update({
        where: { id: anchor.id },
        data: { detached: true }
      })
      return { seriesId: id, appointments: await this.listSeries(id) }
    }

    const seriesId = await this.editMany(series.id, anchor, dto)
    return { seriesId, appointments: await this.listSeries(seriesId) }
  }

  private async editMany(seriesId: string, anchor: Appointment, dto: EditSeriesDto) {
    const affected = await this.prisma.scoped.appointment.findMany({
      where: {
        seriesId,
        detached: false,
        status: "confirmed",
        ...(dto.scope === "following" ? { startsAt: { gte: anchor.startsAt } } : {})
      },
      include: { service: { include: { requirements: true } } },
      orderBy: { startsAt: "asc" }
    })
    if (affected.length === 0) {
      throw new AppException(409, "EMPTY_SCOPE", "No occurrence in this scope can be edited")
    }

    const delta = dto.startsAt ? Date.parse(dto.startsAt) - anchor.startsAt.getTime() : 0
    const targets = affected.map((current) => this.targetOf(current, delta, dto))
    const ordered = delta > 0 ? [...targets].reverse() : targets
    const dentistIds = [
      ...new Set([...targets.map((t) => t.dentistId), ...affected.map((a) => a.dentistId)])
    ].sort()

    const movedSeriesId = await this.prisma.scoped.$transaction(async (tx) => {
      for (const dentistId of dentistIds) {
        await this.appointments.lockDentist(tx, dentistId)
      }

      let nextSeriesId = seriesId
      if (dto.scope === "following") {
        const source = await tx.appointmentSeries.findUniqueOrThrow({ where: { id: seriesId } })
        const next = await tx.appointmentSeries.create({
          data: scoped<Prisma.AppointmentSeriesUncheckedCreateInput>({
            freq: source.freq,
            interval: source.interval,
            byWeekday: [
              ...new Set(targets.map((target) => bangkokWeekday(target.startsAt.getTime())))
            ].sort((a, b) => a - b),
            count: targets.length
          })
        })
        nextSeriesId = next.id
      }

      await this.eachOccurrence(tx, ordered, (target) =>
        this.moveOccurrence(tx, target, nextSeriesId)
      )

      if (dto.scope === "following") {
        const remaining = await tx.appointment.count({ where: { seriesId } })
        await tx.appointmentSeries.update({ where: { id: seriesId }, data: { count: remaining } })
      }
      return nextSeriesId
    }, TRANSACTION_OPTIONS)

    const owner = affected[0]
    if (owner) await this.cache.invalidateWindows(owner.tenantId, [...affected, ...targets])

    return movedSeriesId
  }

  private targetOf(
    current: OccurrenceWithService,
    delta: number,
    dto: EditSeriesDto
  ): MoveTarget {
    const startsAt = new Date(current.startsAt.getTime() + delta)
    const durationMin =
      dto.durationMin ??
      Math.round((current.endsAt.getTime() - current.startsAt.getTime()) / MINUTE)
    return {
      current,
      dentistId: dto.dentistId ?? current.dentistId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMin * MINUTE),
      chairEndsAt: new Date(
        startsAt.getTime() + (durationMin + current.service.bufferMin) * MINUTE
      )
    }
  }

  private async eachOccurrence<T extends OccurrenceWindow>(
    tx: ScopedTransactionClient,
    items: T[],
    attempt: (item: T, index: number) => Promise<void>
  ): Promise<void> {
    const conflicts: SeriesConflict[] = []
    for (const [index, item] of items.entries()) {
      try {
        await this.appointments.withResourceRetry(() =>
          this.withSavepoint(tx, index, () => attempt(item, index))
        )
      } catch (error) {
        const reason = conflictReason(error)
        if (!reason) throw error
        conflicts.push({ startsAt: item.startsAt.toISOString(), reason })
      }
    }
    if (conflicts.length > 0) {
      conflicts.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      throw new AppException(409, "SERIES_CONFLICT", "Some occurrences conflict", { conflicts })
    }
  }

  private async withSavepoint<T>(
    tx: ScopedTransactionClient,
    index: number,
    body: () => Promise<T>
  ): Promise<T> {
    const savepoint = `occ_${index.toFixed(0)}`
    await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
    try {
      const result = await body()
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`)
      return result
    } catch (error) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
      throw error
    }
  }

  private listSeries(seriesId: string) {
    return this.prisma.scoped.appointment.findMany({
      where: { seriesId },
      include: APPOINTMENT_INCLUDE,
      orderBy: { startsAt: "asc" }
    })
  }

  private windowOf(occurrence: Interval, bufferMin: number): OccurrenceWindow {
    return {
      startsAt: new Date(occurrence.start),
      endsAt: new Date(occurrence.end),
      chairEndsAt: new Date(occurrence.end + bufferMin * MINUTE)
    }
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

  private async insertOccurrence(
    tx: ScopedTransactionClient,
    plan: OccurrencePlan,
    win: OccurrenceWindow
  ): Promise<void> {
    const appointment = await tx.appointment.create({
      data: scoped<Prisma.AppointmentUncheckedCreateInput>({
        branchId: plan.branchId,
        serviceId: plan.serviceId,
        dentistId: plan.dentistId,
        patientId: plan.patientId,
        seriesId: plan.seriesId,
        startsAt: win.startsAt,
        endsAt: win.endsAt
      })
    })
    await this.claim(tx, appointment.id, plan.branchId, plan.requirements, win)
  }

  private async moveOccurrence(
    tx: ScopedTransactionClient,
    target: MoveTarget,
    seriesId: string
  ): Promise<void> {
    await tx.appointment.update({
      where: { id: target.current.id },
      data: {
        seriesId,
        dentistId: target.dentistId,
        startsAt: target.startsAt,
        endsAt: target.endsAt,
        version: { increment: 1 }
      }
    })
    await tx.resourceClaim.updateMany({
      where: { appointmentId: target.current.id, status: "active" },
      data: { status: "released" }
    })
    await this.claim(
      tx,
      target.current.id,
      target.current.branchId,
      target.current.service.requirements,
      target
    )
  }

  private async claim(
    tx: ScopedTransactionClient,
    appointmentId: string,
    branchId: string,
    requirements: { equipmentTypeId: string }[],
    win: OccurrenceWindow
  ): Promise<void> {
    const claims = await this.appointments.pickResources(tx, branchId, requirements, win)
    for (const claim of claims) {
      await tx.resourceClaim.create({
        data: scoped<Prisma.ResourceClaimUncheckedCreateInput>({ appointmentId, ...claim })
      })
    }
  }
}
