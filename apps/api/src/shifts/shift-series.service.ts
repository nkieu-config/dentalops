import { Injectable } from "@nestjs/common"
import { expandRecurrence } from "@dentalops/availability"
import { ShiftSeries } from "@prisma/client"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { CreateShiftSeriesDto } from "./dto/create-shift-series.dto"
import { SeriesScope, UpdateShiftSeriesDto } from "./dto/update-shift-series.dto"

const MINUTE = 60_000
const DAY = 86_400_000
const BANGKOK_OFFSET_MS = 420 * MINUTE
const HORIZON_DAYS = 90
const EXCLUSION = /exclusion constraint \\?"(\w+)\\?"/

export interface MaterializeResult {
  created: number
  skipped: number
}

export interface HorizonResult extends MaterializeResult {
  series: number
}

const localDayStart = (ms: number): number =>
  Math.floor((ms + BANGKOK_OFFSET_MS) / DAY) * DAY - BANGKOK_OFFSET_MS

const localDate = (ms: number): string =>
  new Date(ms + BANGKOK_OFFSET_MS).toISOString().slice(0, 10)

const dateColumn = (isoDate: string): Date => new Date(`${isoDate}T00:00:00.000Z`)

const dateColumnToLocal = (value: Date): string => value.toISOString().slice(0, 10)

const startOfSeries = (series: ShiftSeries): number =>
  Date.parse(`${dateColumnToLocal(series.startsOn)}T00:00:00.000Z`) - BANGKOK_OFFSET_MS

const parseTimeStart = (timeStart: string): number => {
  const [hours = "0", minutes = "0"] = timeStart.split(":")
  return Number(hours) * 60 + Number(minutes)
}

const isShiftConflict = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : ""
  return EXCLUSION.exec(message)?.[1] === "no_staff_double_shift"
}

@Injectable()
export class ShiftSeriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateShiftSeriesDto) {
    const staff = await this.prisma.scoped.user.findUnique({ where: { id: dto.staffId } })
    if (!staff) throw new AppException(404, "NOT_FOUND", "Staff member not found")
    const branch = await this.prisma.scoped.branch.findUnique({ where: { id: dto.branchId } })
    if (!branch) throw new AppException(404, "NOT_FOUND", "Branch not found")

    const series = await this.prisma.scoped.shiftSeries.create({
      data: {
        staffId: dto.staffId,
        branchId: dto.branchId,
        freq: dto.freq,
        interval: dto.interval,
        byWeekday: dto.byWeekday,
        timeStart: dto.timeStart,
        durationMin: dto.durationMin,
        startsOn: dateColumn(dto.startsOn),
        endsOn: dto.endsOn ? dateColumn(dto.endsOn) : null
      } as never
    })

    const result = await this.topUp(series, Date.now())
    return { seriesId: series.id, ...result }
  }

  async update(id: string, dto: UpdateShiftSeriesDto) {
    const series = await this.prisma.scoped.shiftSeries.findUnique({ where: { id } })
    if (!series) throw new AppException(404, "NOT_FOUND", "Shift series not found")

    const now = Date.now()
    const rule = {
      interval: dto.interval ?? series.interval,
      byWeekday: dto.byWeekday ?? series.byWeekday,
      timeStart: dto.timeStart ?? series.timeStart,
      durationMin: dto.durationMin ?? series.durationMin
    }

    if (dto.scope === "all") {
      const from = Math.max(localDayStart(now), startOfSeries(series))
      await this.clearFrom(id, from)
      const updated = await this.prisma.scoped.shiftSeries.update({ where: { id }, data: rule })
      const result = await this.materialize(updated, from, this.horizonEnd(now))
      return { seriesId: id, ...result }
    }

    const boundary = localDayStart(dto.from ? Date.parse(dto.from) : now)
    await this.prisma.scoped.shiftSeries.update({
      where: { id },
      data: { endsOn: dateColumn(localDate(boundary - DAY)) }
    })
    const next = await this.prisma.scoped.shiftSeries.create({
      data: {
        staffId: series.staffId,
        branchId: series.branchId,
        freq: series.freq,
        startsOn: dateColumn(localDate(boundary)),
        endsOn: series.endsOn,
        ...rule
      } as never
    })
    await this.clearFrom(id, boundary)
    const result = await this.materialize(next, boundary, this.horizonEnd(now))
    return { seriesId: next.id, ...result }
  }

  async remove(id: string, scope: SeriesScope) {
    const series = await this.prisma.scoped.shiftSeries.findUnique({ where: { id } })
    if (!series) throw new AppException(404, "NOT_FOUND", "Shift series not found")

    if (scope === "all") {
      await this.prisma.scoped.shiftSeries.delete({ where: { id } })
      return
    }

    const boundary = localDayStart(Date.now())
    await this.clearFrom(id, boundary)
    await this.prisma.scoped.shiftSeries.update({
      where: { id },
      data: { endsOn: dateColumn(localDate(boundary - DAY)) }
    })
  }

  async extendHorizon(now: number): Promise<HorizonResult> {
    const open = await this.prisma.scoped.shiftSeries.findMany({
      where: { OR: [{ endsOn: null }, { endsOn: { gte: dateColumn(localDate(now)) } }] },
      orderBy: { createdAt: "asc" }
    })
    let created = 0
    let skipped = 0
    for (const series of open) {
      const result = await this.topUp(series, now)
      created += result.created
      skipped += result.skipped
    }
    return { series: open.length, created, skipped }
  }

  private horizonEnd(now: number): number {
    return localDayStart(now) + HORIZON_DAYS * DAY
  }

  private clearFrom(seriesId: string, from: number) {
    return this.prisma.scoped.shift.deleteMany({
      where: { seriesId, detached: false, startsAt: { gte: new Date(from) } }
    })
  }

  private async topUp(series: ShiftSeries, now: number): Promise<MaterializeResult> {
    const latest = await this.prisma.scoped.shift.aggregate({
      where: { seriesId: series.id },
      _max: { startsAt: true }
    })
    const anchor = latest._max.startsAt?.getTime() ?? startOfSeries(series)
    return this.materialize(series, Math.max(anchor, localDayStart(now)), this.horizonEnd(now))
  }

  private async materialize(
    series: ShiftSeries,
    from: number,
    to: number
  ): Promise<MaterializeResult> {
    const occurrences = expandRecurrence(
      {
        freq: series.freq,
        interval: series.interval,
        byWeekday: series.byWeekday,
        timeStartMin: parseTimeStart(series.timeStart),
        durationMin: series.durationMin,
        startsOn: dateColumnToLocal(series.startsOn),
        endsOn: series.endsOn ? dateColumnToLocal(series.endsOn) : undefined
      },
      { start: from, end: to }
    )

    const present = await this.prisma.scoped.shift.findMany({
      where: { seriesId: series.id, startsAt: { gte: new Date(from), lt: new Date(to) } },
      select: { startsAt: true, detached: true }
    })
    const taken = new Set(present.map((shift) => shift.startsAt.getTime()))
    const excepted = new Set(
      present.filter((shift) => shift.detached).map((shift) => localDate(shift.startsAt.getTime()))
    )

    let created = 0
    let skipped = 0
    for (const occurrence of occurrences) {
      if (taken.has(occurrence.start) || excepted.has(localDate(occurrence.start))) {
        skipped++
        continue
      }
      try {
        await this.prisma.scoped.shift.create({
          data: {
            staffId: series.staffId,
            branchId: series.branchId,
            seriesId: series.id,
            startsAt: new Date(occurrence.start),
            endsAt: new Date(occurrence.end)
          } as never
        })
        created++
      } catch (error) {
        if (!isShiftConflict(error)) throw error
        skipped++
      }
    }
    return { created, skipped }
  }
}
