import { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import type { Job } from "bullmq"
import type Redis from "ioredis"
import type { Server } from "node:http"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { ConfirmationJobData, MailQueue } from "../src/mail/mail.queue"
import { MAIL_TRANSPORT, MailMessage, MailTransport } from "../src/mail/mail.transport"
import { PrismaService } from "../src/prisma/prisma.service"
import { REDIS } from "../src/redis/redis.module"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const THROTTLER_KEY_PATTERN = "*:default}:*"
const DURATION_MIN = 45

const utc = (hour: number, minute = 0) => new Date(Date.UTC(2027, 5, 7, hour, minute)).toISOString()

class RecordingTransport implements MailTransport {
  readonly attempts: MailMessage[] = []
  readonly sent: MailMessage[] = []
  failFor: string | null = null

  send(message: MailMessage): Promise<void> {
    this.attempts.push(message)
    if (this.failFor === message.to) {
      return Promise.reject(new Error("smtp is down"))
    }
    this.sent.push(message)
    return Promise.resolve()
  }

  attemptsTo(address: string): MailMessage[] {
    return this.attempts.filter((message) => message.to === address)
  }

  sentTo(address: string): MailMessage[] {
    return this.sent.filter((message) => message.to === address)
  }
}

const waitFor = async (predicate: () => boolean, timeoutMs = 15_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`condition not met within ${timeoutMs}ms`)
}

interface ConfirmResponse {
  appointment: { id: string; startsAt: string }
  manageToken: string
}

describe("confirmation email", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let redis: Redis
  let mail: MailQueue
  const transport = new RecordingTransport()
  const slug = `mail-clinic-${Date.now()}`
  const clinicName = `Booking ${slug}`
  let tenantId: string
  let branchId: string
  let serviceId: string
  let dentistId: string

  const clearThrottleState = async () => {
    const keys = await redis.keys(THROTTLER_KEY_PATTERN)
    if (keys.length > 0) await redis.del(...keys)
  }

  const acquire = async (startsAt: string): Promise<string> => {
    const res = await request(server)
      .post(`/public/${slug}/holds`)
      .send({ serviceId, branchId, dentistId, startsAt })
    expectStatus(res, 201)
    return (res.body as { holdId: string }).holdId
  }

  const confirm = (
    holdId: string,
    patient: { name: string; phone: string; email?: string }
  ) => request(server).post(`/public/${slug}/appointments`).send({ holdId, ...patient })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp(
      Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(MAIL_TRANSPORT)
        .useValue(transport)
    ))
    prisma = app.get(PrismaService)
    redis = app.get<Redis>(REDIS)
    mail = app.get(MailQueue)
    await clearThrottleState()

    const signup = await request(server).post("/auth/signup").send({
      clinicName,
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Mail Owner"
    })
    expectStatus(signup, 200)
    tenantId = signup.body.user.tenantId as string

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } })
    const service = await prisma.service.create({
      data: { tenantId, name: "Mail Probe", durationMin: DURATION_MIN, bufferMin: 0 }
    })
    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: `dentist@${slug}.local`,
        passwordHash: "x",
        name: "Dr. Mail",
        role: "dentist"
      }
    })
    await prisma.shift.create({
      data: {
        tenantId,
        staffId: dentist.id,
        branchId: branch.id,
        startsAt: new Date(utc(2)),
        endsAt: new Date(utc(13))
      }
    })
    branchId = branch.id
    serviceId = service.id
    dentistId = dentist.id
  })

  afterAll(async () => {
    await clearThrottleState()
    await mail.queue.obliterate({ force: true })
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  beforeEach(async () => {
    transport.failFor = null
    await clearThrottleState()
  })

  it("enqueues exactly one confirmation job carrying the appointment id", async () => {
    const add = jest.spyOn(mail.queue, "add")
    try {
      const res = await confirm(await acquire(utc(2)), {
        name: "Enqueue Once",
        phone: "0830000001",
        email: "enqueue-once@example.com"
      })
      expectStatus(res, 201)
      const { appointment } = res.body as ConfirmResponse

      expect(add).toHaveBeenCalledTimes(1)
      const call = add.mock.calls[0]
      expect(call?.[0]).toBe("confirmation")
      expect(call?.[1]).toMatchObject({ appointmentId: appointment.id })

      const job = (await add.mock.results[0]?.value) as Job<ConfirmationJobData>
      expect(job.data.appointmentId).toBe(appointment.id)
      expect(job.opts.attempts).toBe(3)
      expect(job.opts.backoff).toEqual({ type: "exponential", delay: 1000 })
      expect(job.opts.removeOnComplete).toBe(50)
    } finally {
      add.mockRestore()
    }
  })

  it("renders the clinic name, the Bangkok appointment time, and the manage link", async () => {
    const address = "render-me@example.com"
    const res = await confirm(await acquire(utc(3)), {
      name: "Render Me",
      phone: "0830000002",
      email: address
    })
    expectStatus(res, 201)
    const { manageToken } = res.body as ConfirmResponse

    await waitFor(() => transport.sentTo(address).length > 0)
    const message = transport.sentTo(address)[0]!

    expect(message.subject).toContain(clinicName)
    expect(message.text).toContain("10:00")
    expect(message.text).toContain("Bangkok")
    expect(message.text).toContain(`/manage/${manageToken}`)
    expect(message.text).toContain("Mail Probe")
    expect(message.text).toContain("Dr. Mail")
    expect(message.html).toContain(`/manage/${manageToken}`)
  })

  it("still returns 201 and retries three times when the transport throws", async () => {
    const address = "always-fails@example.com"
    transport.failFor = address

    const add = jest.spyOn(mail.queue, "add")
    let job: Job<ConfirmationJobData>
    try {
      const res = await confirm(await acquire(utc(4)), {
        name: "Failing Transport",
        phone: "0830000003",
        email: address
      })
      expectStatus(res, 201)
      expect(res.body.appointment.id).toEqual(expect.any(String))
      job = (await add.mock.results[0]?.value) as Job<ConfirmationJobData>
    } finally {
      add.mockRestore()
    }

    expect(job.opts.attempts).toBe(3)

    await waitFor(() => transport.attemptsTo(address).length >= 3)
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(transport.attemptsTo(address)).toHaveLength(3)
    expect(transport.sentTo(address)).toHaveLength(0)

    const stored = await prisma.appointment.findMany({
      where: { tenantId, patient: { phone: "0830000003" } }
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]!.status).toBe("confirmed")
  })

  it("keeps the booking successful when enqueuing itself fails", async () => {
    const add = jest.spyOn(mail.queue, "add").mockRejectedValue(new Error("redis is down"))
    try {
      const res = await confirm(await acquire(utc(5)), {
        name: "Queue Down",
        phone: "0830000004",
        email: "queue-down@example.com"
      })
      expectStatus(res, 201)
    } finally {
      add.mockRestore()
    }

    const stored = await prisma.appointment.findMany({
      where: { tenantId, patient: { phone: "0830000004" } }
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]!.status).toBe("confirmed")
  })
})
