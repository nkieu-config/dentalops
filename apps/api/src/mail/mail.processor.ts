import { Inject, Injectable } from "@nestjs/common"
import type Redis from "ioredis"
import { PrismaService } from "../prisma/prisma.service"
import { JobWorker } from "../redis/job-worker"
import { tenantContext } from "../tenant/tenant-context"
import { ConfirmationJobData, MAIL_QUEUE_NAME, MAIL_REDIS } from "./mail.queue"
import { MAIL_TRANSPORT, MailTransport } from "./mail.transport"
import { renderConfirmation } from "./templates"

@Injectable()
export class MailProcessor extends JobWorker<ConfirmationJobData> {
  constructor(
    @Inject(MAIL_REDIS) connection: Redis,
    private readonly prisma: PrismaService,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport
  ) {
    super(connection, MAIL_QUEUE_NAME, "confirmation email attempt failed")
  }

  protected handle(data: ConfirmationJobData): Promise<void> {
    return this.process(data)
  }

  process(data: ConfirmationJobData): Promise<void> {
    return tenantContext.run(
      { tenantId: data.tenantId, userId: "mail", role: "system", name: "Mail worker" },
      async () => {
        if (!data.patientEmail) return

        const appointment = await this.prisma.scoped.appointment.findUnique({
          where: { id: data.appointmentId },
          select: {
            startsAt: true,
            tenant: { select: { name: true } },
            branch: { select: { name: true } },
            service: { select: { name: true } },
            dentist: { select: { name: true } }
          }
        })
        if (!appointment) return

        await this.transport.send(
          renderConfirmation({
            to: data.patientEmail,
            clinicName: appointment.tenant.name,
            patientName: data.patientName,
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
}
