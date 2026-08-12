import { Inject, Injectable } from "@nestjs/common"
import type Redis from "ioredis"
import { PrismaService } from "../prisma/prisma.service"
import { JobWorker } from "../redis/job-worker"
import { ShiftSeriesService } from "../shifts/shift-series.service"
import { tenantContext } from "../tenant/tenant-context"
import { HORIZON_QUEUE_NAME, HORIZON_REDIS } from "./horizon.queue"

export interface HorizonSummary {
  tenants: number
  series: number
  created: number
  skipped: number
}

@Injectable()
export class HorizonProcessor extends JobWorker {
  constructor(
    @Inject(HORIZON_REDIS) connection: Redis,
    private readonly prisma: PrismaService,
    private readonly series: ShiftSeriesService
  ) {
    super(connection, HORIZON_QUEUE_NAME, "horizon run failed")
  }

  protected handle(): Promise<unknown> {
    return this.run()
  }

  async run(now: number = Date.now()): Promise<HorizonSummary> {
    const tenants = await this.prisma.shiftSeries.findMany({
      distinct: ["tenantId"],
      select: { tenantId: true },
      orderBy: { tenantId: "asc" }
    })
    const summary: HorizonSummary = { tenants: tenants.length, series: 0, created: 0, skipped: 0 }

    for (const { tenantId } of tenants) {
      const result = await tenantContext.run(
        { tenantId, userId: "horizon", role: "system", name: "Horizon worker" },
        async () => await this.series.extendHorizon(now)
      )
      summary.series += result.series
      summary.created += result.created
      summary.skipped += result.skipped
    }

    this.logger.log(
      `horizon: ${summary.created} created, ${summary.skipped} skipped across ${summary.series} series`
    )
    return summary
  }
}
