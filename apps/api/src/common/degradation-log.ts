import { Logger } from "@nestjs/common"

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export class DegradationLog {
  private degraded = false

  constructor(
    private readonly logger: Logger,
    private readonly lost: string,
    private readonly regained: string
  ) {}

  report(error: unknown): void {
    if (this.degraded) return
    this.degraded = true
    this.logger.warn(`${this.lost}: ${reasonOf(error)}`)
  }

  clear(): void {
    if (!this.degraded) return
    this.degraded = false
    this.logger.log(this.regained)
  }
}
