import { INestApplication, ValidationPipe } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import cookieParser from "cookie-parser"
import { apiErrorSchema } from "@dentalops/contracts"
import { AppModule } from "../src/app.module"
import { PrismaService } from "../src/prisma/prisma.service"

interface PatientRow {
  id: string
  name: string
  phone: string
  email: string
}

interface PatientPage {
  items: PatientRow[]
  nextCursor: string | null
}

describe("patients endpoints", () => {
  let app: INestApplication
  let prisma: PrismaService
  let ownerToken: string
  let tenantId: string
  let seededIds: string[]
  const slug = `patients-api-${Date.now()}`

  const phoneFor = (i: number) => `08${String(i).padStart(8, "0")}`
  const nameFor = (i: number) => (i === 7 ? "Kanya Wongchai" : `Patient Number ${i}`)

  const created = {
    name: "Jaruwan Sombat",
    phone: "0899999999",
    email: "jaruwan@patientsapi.local",
    notes: "prefers morning slots"
  }

  const listPage = (query: Record<string, string | number>) =>
    request(app.getHttpServer())
      .get("/patients")
      .set("Authorization", `Bearer ${ownerToken}`)
      .query(query)

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    prisma = app.get(PrismaService)
    await app.init()

    const signup = await request(app.getHttpServer()).post("/auth/signup").send({
      clinicName: "Patients Test Clinic",
      slug,
      email: "owner@patientsapi.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    tenantId = tenant!.id

    seededIds = []
    for (let i = 0; i < 25; i++) {
      const res = await request(app.getHttpServer())
        .post("/patients")
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({
          name: nameFor(i),
          phone: phoneFor(i),
          email: `patient${i}@patientsapi.local`
        })
        .expect(201)
      seededIds.push(res.body.id)
    }
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("creates a patient", async () => {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(created)
      .expect(201)
    expect(res.body.id).toEqual(expect.any(String))
    expect(res.body.name).toBe(created.name)
    expect(res.body.phone).toBe(created.phone)
    expect(res.body.email).toBe(created.email)
    expect(res.body.notes).toBe(created.notes)
    expect(res.body.tenantId).toBe(tenantId)
  })

  it("rejects a duplicate phone and email with DUPLICATE_PATIENT", async () => {
    const res = await request(app.getHttpServer())
      .post("/patients")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(created)
      .expect(409)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("DUPLICATE_PATIENT")
  })

  it("walks every page through the cursor without overlap or omission", async () => {
    const total = await prisma.patient.count({ where: { tenantId } })
    expect(total).toBe(26)

    const first = await listPage({ limit: 10 }).expect(200)
    const page1 = first.body as PatientPage
    expect(page1.items.length).toBe(10)
    expect(page1.nextCursor).not.toBeNull()

    const second = await listPage({ limit: 10, cursor: page1.nextCursor! }).expect(200)
    const page2 = second.body as PatientPage
    expect(page2.items.length).toBe(10)
    expect(page2.nextCursor).not.toBeNull()

    const page1Ids = page1.items.map((p) => p.id)
    const page2Ids = page2.items.map((p) => p.id)
    expect(page1Ids.filter((id) => page2Ids.includes(id))).toEqual([])

    const seen: string[] = [...page1Ids, ...page2Ids]
    let cursor = page2.nextCursor
    while (cursor) {
      const next = await listPage({ limit: 10, cursor }).expect(200)
      const page = next.body as PatientPage
      seen.push(...page.items.map((p) => p.id))
      cursor = page.nextCursor
    }
    expect(seen.length).toBe(total)
    expect(new Set(seen).size).toBe(total)
  })

  it("searches by name substring and by phone substring", async () => {
    const byName = await listPage({ q: "kanya" }).expect(200)
    const nameHits = (byName.body as PatientPage).items
    expect(nameHits.length).toBe(1)
    expect(nameHits[0]!.name).toBe("Kanya Wongchai")

    const byPhone = await listPage({ q: "0000007" }).expect(200)
    const phoneHits = (byPhone.body as PatientPage).items
    expect(phoneHits.length).toBe(1)
    expect(phoneHits[0]!.phone).toBe(phoneFor(7))
  })

  it("rejects a malformed cursor with INVALID_CURSOR", async () => {
    const res = await listPage({ cursor: Buffer.from("garbage").toString("base64url") }).expect(400)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("INVALID_CURSOR")
  })

  it("reads one patient by id and 404s on an unknown id", async () => {
    const res = await request(app.getHttpServer())
      .get(`/patients/${seededIds[0]}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200)
    expect(res.body.id).toBe(seededIds[0])
    expect(res.body.phone).toBe(phoneFor(0))

    const missing = await request(app.getHttpServer())
      .get("/patients/00000000-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(404)
    expect(apiErrorSchema.parse(missing.body).errorCode).toBe("NOT_FOUND")
  })
})
