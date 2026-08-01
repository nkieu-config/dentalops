import { Inject, Injectable, Logger, OnModuleDestroy } from "@nestjs/common"
import { Job, Worker } from "bullmq"
import Redis from "ioredis"
import { PrismaService } from "../prisma/prisma.service"
import { tenantContext } from "../tenant/tenant-context"
import { ConfirmationJobData, MAIL_QUEUE_NAME } from "./mail.queue"
import { MAIL_REDIS } from "./mail.redis"
import { MAIL_TRANSPORT, MailTransport } from "./mail.transport"
import { renderConfirmation } from "./templates"

@Injectable()
export class MailProcessor implements OnModuleDestroy {
  private readonly worker: Worker<ConfirmationJobData>
  private readonly logger = new Logger(MailProcessor.name)

  constructor(
    @Inject(MAIL_REDIS) connection: Redis,
    private readonly prisma: PrismaService,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport
  ) {
    this.worker = new Worker<ConfirmationJobData>(
      MAIL_QUEUE_NAME,
      (job: Job<ConfirmationJobData>) => this.process(job.data),
      { connection }
    )
    this.worker.on("error", (error) => this.logger.error(`mail worker error: ${error.message}`))
    this.worker.on("failed", (_job, error) =>
      this.logger.warn(`confirmation email attempt failed: ${error.message}`)
    )
  }

  process(data: ConfirmationJobData): Promise<void> {
    return tenantContext.run(
      { tenantId: data.tenantId, userId: "mail", role: "system" },
      async () => {
        const appointment = await this.prisma.scoped.appointment.findUnique({
          where: { id: data.appointmentId },
          select: {
            startsAt: true,
            tenant: { select: { name: true } },
            branch: { select: { name: true } },
            service: { select: { name: true } },
            dentist: { select: { name: true } },
            patient: { select: { name: true, email: true } }
          }
        })
        if (!appointment || !appointment.patient.email) return

        await this.transport.send(
          renderConfirmation({
            to: appointment.patient.email,
            clinicName: appointment.tenant.name,
            patientName: appointment.patient.name,
            serviceName: appointment.service.name,
            dentistName: appointment.dentist.name,
            branchName: appointment.branch.name,
            startsAt: appointment.startsAt,
            manageToken: data.manageToken
          })
        )
      }
    )
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close()
  }
}
