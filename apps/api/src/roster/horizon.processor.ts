import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common"
import { Worker } from "bullmq"
import Redis from "ioredis"
import { PrismaService } from "../prisma/prisma.service"
import { ShiftSeriesService } from "../shifts/shift-series.service"
import { tenantContext } from "../tenant/tenant-context"
import { HORIZON_QUEUE_NAME } from "./horizon.queue"
import { HORIZON_REDIS } from "./horizon.redis"

export interface HorizonSummary {
  tenants: number
  series: number
  created: number
  skipped: number
}

@Injectable()
export class HorizonProcessor implements OnModuleDestroy {
  private readonly worker: Worker
  private readonly logger = new Logger(HorizonProcessor.name)

  constructor(
    @Inject(HORIZON_REDIS) connection: Redis,
    private readonly prisma: PrismaService,
    private readonly series: ShiftSeriesService
  ) {
    this.worker = new Worker(HORIZON_QUEUE_NAME, () => this.run(), { connection })
    this.worker.on("error", (error) => this.logger.error(`horizon worker error: ${error.message}`))
    this.worker.on("failed", (_job, error) =>
      this.logger.warn(`horizon run failed: ${error.message}`)
    )
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
        { tenantId, userId: "horizon", role: "system" },
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

  async onModuleDestroy(): Promise<void> {
    await this.worker.close()
  }
}
