import { Injectable, Logger } from "@nestjs/common"
import { AuditService } from "../audit/audit.service"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { DEMO_SLUG, DemoSeedCounts, seedDemoTenant } from "./demo-seed"

@Injectable()
export class DemoResetService {
  private readonly logger = new Logger(DemoResetService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async reset(slug: string = DEMO_SLUG): Promise<DemoSeedCounts> {
    if (slug !== DEMO_SLUG) {
      throw new AppException(
        403,
        "NOT_THE_DEMO_TENANT",
        `Refusing to reset ${slug}; only ${DEMO_SLUG} may be reset`
      )
    }
    const counts = await seedDemoTenant(this.prisma, this.audit)
    this.logger.log(
      `demo reset: ${counts.patients} patients, ${counts.shifts} shifts, ${counts.appointments} appointments`
    )
    return counts
  }
}
