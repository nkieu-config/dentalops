import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { AuditPage, AuditService } from "../src/audit/audit.service"
import { MONGO, type MongoConnection } from "../src/audit/mongo.provider"
import { PrismaService } from "../src/prisma/prisma.service"
import { tenantContext } from "../src/tenant/tenant-context"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const settle = () => new Promise((resolve) => setTimeout(resolve, 200))

interface SerializedPage {
  entries: Array<{
    tenantId: string
    at: string
    requestId: string
    actor: { id: string; type: string }
    entity: { type: string; id: string }
  }>
  nextCursor: string | null
}

describe("audit log", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let audit: AuditService
  let token: string
  let tenantId: string
  let branchId: string
  let serviceId: string
  let dentistId: string
  let patientId: string
  const slug = `audit-${Date.now()}`

  const listAsTenant = (limit: number): Promise<AuditPage> =>
    tenantContext.run(
      { tenantId, userId: "test-user", role: "owner", name: "Test User" },
      async () => await audit.list({ limit })
    )

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    audit = app.get(AuditService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Audit Clinic",
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    token = (signup.body as { accessToken: string }).accessToken

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } })
    tenantId = tenant.id
    const passwordHash = (
      await prisma.user.findFirstOrThrow({
        where: { tenantId: tenant.id },
        omit: { passwordHash: false }
      })
    ).passwordHash
    const dentist = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `d@${slug}.local`,
        passwordHash,
        name: "Dentist",
        role: "dentist"
      }
    })
    dentistId = dentist.id
    branchId = (await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id } })).id
    serviceId = (await prisma.service.findFirstOrThrow({ where: { tenantId: tenant.id } })).id
    patientId = (
      await prisma.patient.create({
        data: {
          tenantId: tenant.id,
          name: "Ploy",
          phone: `07${Date.now() % 100000000}`,
          email: `ploy@${slug}.local`
        }
      })
    ).id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("is wired to a real mongo instance", () => {
    expect(audit.enabled).toBe(true)
  })

  it("records a successful booking", async () => {
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ branchId, serviceId, dentistId, patientId, startsAt: "2027-04-01T03:00:00.000Z" })
    expectStatus(res, 201)
    await settle()

    const page = await listAsTenant(10)
    const entry = page.entries.find((e) => e.entity.id === (res.body as { id: string }).id)
    expect(entry).toBeDefined()
    expect(entry!.action).toBe("POST /appointments")
    expect(entry!.actor.name).toBe("Owner")
    expect(entry!.actor.type).toBe("staff")
    expect(entry!.requestId).toBeTruthy()
  })

  it("records nothing when the mutation failed", async () => {
    const before = (await listAsTenant(50)).entries.length
    const res = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ branchId, serviceId, dentistId, patientId, startsAt: "not-a-date" })
    expect(res.status).toBeGreaterThanOrEqual(400)
    await settle()
    expect((await listAsTenant(50)).entries.length).toBe(before)
  })

  it("captures before and after on a status change", async () => {
    const created = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ branchId, serviceId, dentistId, patientId, startsAt: "2027-04-02T03:00:00.000Z" })
    expectStatus(created, 201)
    const id = (created.body as { id: string }).id

    const res = await request(server)
      .patch(`/appointments/${id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "completed" })
    expectStatus(res, 200)
    await settle()

    const page = await listAsTenant(20)
    const entry = page.entries.find((e) => e.entity.id === id && e.action === "appointment.status")
    expect(entry).toBeDefined()
    expect((entry!.before as { status: string }).status).toBe("confirmed")
    expect((entry!.after as { status: string }).status).toBe("completed")
  })

  it("sizes its pool for a shared free-tier cluster rather than the driver default", async () => {
    const options = (audit as unknown as { mongo: { client: { options: Record<string, unknown> } } })
      .mongo.client.options
    expect(options.maxPoolSize).toBe(10)
    expect(options.minPoolSize).toBe(0)
    expect(options.socketTimeoutMS).toBeGreaterThan(0)
  })

  it("keeps serving when its indexes cannot be created", async () => {
    const failing = {
      createIndex: () => Promise.reject(new Error("not authorized on dentalops")),
      indexes: () => Promise.resolve([])
    }
    const service: AuditService = Object.create(AuditService.prototype) as AuditService
    Object.defineProperty(service, "collection", { get: () => failing })
    Object.defineProperty(service, "logger", { value: { warn: () => undefined } })

    await expect(service.onModuleInit()).resolves.toBeUndefined()
  })

  it("expires entries so a free-tier cluster cannot fill up", async () => {
    const indexes = await audit.describeIndexes()
    const ttl = indexes.find((i) => i.expireAfterSeconds !== undefined)
    expect(ttl).toBeDefined()
    expect(ttl!.expireAfterSeconds).toBe(30 * 24 * 60 * 60)
  })

  it("pages without a blocking sort, so a busy clinic's log stays cheap to read", async () => {
    const mongo = app.get<MongoConnection>(MONGO)
    const plan = (await mongo.client
      .db(mongo.dbName)
      .collection("audit_logs")
      .find({ tenantId })
      .sort({ _id: -1 })
      .limit(51)
      .explain("queryPlanner")) as { queryPlanner: { winningPlan: unknown } }

    expect(JSON.stringify(plan.queryPlanner.winningPlan)).not.toContain('"stage":"SORT"')
  })

  it("never returns another tenant's entries", async () => {
    const page = await listAsTenant(100)
    expect(page.entries.length).toBeGreaterThan(0)
    expect(page.entries.every((e) => e.tenantId === tenantId)).toBe(true)
  })

  it("serves an owner their own tenant's entries over http", async () => {
    const res = await request(server)
      .get("/audit-logs?limit=5")
      .set("Authorization", `Bearer ${token}`)
    expectStatus(res, 200)
    const body = res.body as SerializedPage
    expect(body.entries.length).toBeGreaterThan(0)
    expect(body.entries.length).toBeLessThanOrEqual(5)
    expect(body.entries.every((entry) => entry.tenantId === tenantId)).toBe(true)
  })

  it("walks older entries through the cursor without repeating one", async () => {
    const first = await request(server)
      .get("/audit-logs?limit=1")
      .set("Authorization", `Bearer ${token}`)
    expectStatus(first, 200)
    const firstPage = first.body as SerializedPage
    expect(firstPage.nextCursor).toBeTruthy()

    const second = await request(server)
      .get(`/audit-logs?limit=1&cursor=${firstPage.nextCursor!}`)
      .set("Authorization", `Bearer ${token}`)
    expectStatus(second, 200)
    const secondPage = second.body as SerializedPage
    expect(secondPage.entries).toHaveLength(1)
    expect(secondPage.entries[0]).not.toEqual(firstPage.entries[0])
    expect(secondPage.entries[0]!.at <= firstPage.entries[0]!.at).toBe(true)
  })

  it("narrows to the requested entity types", async () => {
    const shift = await request(server)
      .post("/shifts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        staffId: dentistId,
        branchId,
        startsAt: "2027-04-03T02:00:00.000Z",
        endsAt: "2027-04-03T10:00:00.000Z"
      })
    expectStatus(shift, 201)
    await settle()

    const res = await request(server)
      .get("/audit-logs?limit=50&entityTypes=shifts")
      .set("Authorization", `Bearer ${token}`)
    expectStatus(res, 200)
    const body = res.body as SerializedPage
    expect(body.entries.length).toBeGreaterThan(0)
    expect(body.entries.every((entry) => entry.entity.type === "shifts")).toBe(true)
  })

  it("narrows to a single actor", async () => {
    const created = await request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${token}`)
      .send({ branchId, serviceId, dentistId, patientId, startsAt: "2027-04-04T03:00:00.000Z" })
    expectStatus(created, 201)
    const appointmentId = (created.body as { id: string }).id

    const login = await request(server)
      .post("/auth/login")
      .send({ email: `d@${slug}.local`, password: "s3cure-pass", clinicSlug: slug })
    expectStatus(login, 200)
    const dentistToken = (login.body as { accessToken: string }).accessToken

    const statusChange = await request(server)
      .patch(`/appointments/${appointmentId}/status`)
      .set("Authorization", `Bearer ${dentistToken}`)
      .send({ status: "completed" })
    expectStatus(statusChange, 200)
    await settle()

    const res = await request(server)
      .get(`/audit-logs?limit=50&actorId=${dentistId}`)
      .set("Authorization", `Bearer ${token}`)
    expectStatus(res, 200)
    const body = res.body as SerializedPage
    expect(body.entries.length).toBeGreaterThan(0)
    expect(body.entries.every((entry) => entry.actor.id === dentistId)).toBe(true)
  })

  it("narrows to guest activity, which so far there is none of", async () => {
    const res = await request(server)
      .get("/audit-logs?limit=50&actorType=public")
      .set("Authorization", `Bearer ${token}`)
    expectStatus(res, 200)
    expect((res.body as SerializedPage).entries).toEqual([])
  })

  it("rejects an unknown actorType", async () => {
    const res = await request(server)
      .get("/audit-logs?actorType=admin")
      .set("Authorization", `Bearer ${token}`)
    expectStatus(res, 400)
  })

  it("narrows to a date range", async () => {
    const future = await request(server)
      .get(`/audit-logs?limit=50&from=${new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()}`)
      .set("Authorization", `Bearer ${token}`)
    expectStatus(future, 200)
    expect((future.body as SerializedPage).entries).toEqual([])

    const past = await request(server)
      .get("/audit-logs?limit=50&to=2020-01-01T00:00:00.000Z")
      .set("Authorization", `Bearer ${token}`)
    expectStatus(past, 200)
    expect((past.body as SerializedPage).entries).toEqual([])
  })

  it("rejects an unparseable date", async () => {
    const res = await request(server)
      .get("/audit-logs?from=not-a-date")
      .set("Authorization", `Bearer ${token}`)
    expectStatus(res, 400)
  })

  it("refuses a dentist, who may not read the clinic's audit log", async () => {
    const login = await request(server)
      .post("/auth/login")
      .send({ email: `d@${slug}.local`, password: "s3cure-pass", clinicSlug: slug })
    expectStatus(login, 200)

    const res = await request(server)
      .get("/audit-logs")
      .set("Authorization", `Bearer ${(login.body as { accessToken: string }).accessToken}`)
    expectStatus(res, 403)
    expect((res.body as { errorCode: string }).errorCode).toBe("FORBIDDEN")
  })

  it("returns nothing at all without a tenant context", async () => {
    const page = await audit.list({ limit: 10 })
    expect(page.entries).toEqual([])
    expect(page.nextCursor).toBeNull()
  })
})
