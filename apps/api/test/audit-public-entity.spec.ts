import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { AuditEntry, AuditService } from "../src/audit/audit.service"
import { PrismaService } from "../src/prisma/prisma.service"
import { tenantContext } from "../src/tenant/tenant-context"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const PREFIX = "/api/v1"
const settle = () => new Promise((resolve) => setTimeout(resolve, 250))

const utc = (hour: number) => new Date(Date.UTC(2027, 7, 9, hour)).toISOString()

describe("audit under the production url prefix", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let audit: AuditService
  let tenantId: string
  let branchId: string
  let serviceId: string
  let dentistId: string
  const slug = `audit-prefix-${Date.now()}`

  const entries = async (): Promise<AuditEntry[]> =>
    tenantContext.run(
      { tenantId, userId: "test", role: "owner", name: "Test" },
      async () => (await audit.list({ limit: 20 })).entries
    )

  beforeAll(async () => {
    ;({ app, server } = await createTestApp(undefined, { globalPrefix: "api/v1" }))
    prisma = app.get(PrismaService)
    audit = app.get(AuditService)
    expect(audit.enabled).toBe(true)

    const signup = await request(server).post(`${PREFIX}/auth/signup`).send({
      clinicName: "Prefix Clinic",
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    tenantId = signup.body.user.tenantId as string

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } })
    const service = await prisma.service.create({
      data: { tenantId, name: "Prefix Probe", durationMin: 45, bufferMin: 0 }
    })
    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: `dentist@${slug}.local`,
        passwordHash: "x",
        name: "Dr. Prefix",
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
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("records the appointment id when a guest books through the public wizard", async () => {
    const hold = await request(server)
      .post(`${PREFIX}/public/${slug}/holds`)
      .send({ serviceId, branchId, dentistId, startsAt: utc(3) })
    expectStatus(hold, 201)

    const confirm = await request(server).post(`${PREFIX}/public/${slug}/appointments`).send({
      holdId: hold.body.holdId,
      name: "Prefix Patient",
      phone: "0891112233",
      email: "prefix@example.com"
    })
    expectStatus(confirm, 201)
    const appointmentId = confirm.body.appointment.id as string
    await settle()

    const entry = (await entries()).find(
      (e) => e.action === "POST /public/:clinicSlug/appointments"
    )
    expect(entry).toBeDefined()
    expect(entry!.entity.id).toBe(appointmentId)
    expect(entry!.entity.type).toBe("public")
  })

  it("strips the url prefix so recorded actions match what the activity feed translates", async () => {
    const all = await entries()
    expect(all.length).toBeGreaterThan(0)
    for (const entry of all) {
      expect(entry.action).not.toContain("/api/v1")
      expect(entry.entity.type).not.toBe("api")
    }
  })
})
