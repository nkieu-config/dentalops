import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("POST /staff", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService

  const stamp = Date.now()
  const slugA = `staff-a-${stamp}`
  const slugB = `staff-b-${stamp}`
  const sharedEmail = `shared-${stamp}@example.com`

  let ownerAToken: string
  let ownerBToken: string
  let receptionistToken: string
  let dentistToken: string

  const password = "s3cure-pass"

  const signup = async (slug: string) => {
    const res = await request(server).post("/auth/signup").send({
      clinicName: "Staff Clinic",
      slug,
      email: `owner@${slug}.local`,
      password,
      name: "Owner"
    })
    expectStatus(res, 200)
    return (res.body as { accessToken: string }).accessToken
  }

  const login = async (clinicSlug: string, email: string) => {
    const res = await request(server)
      .post("/auth/login")
      .send({ clinicSlug, email, password })
    expectStatus(res, 200)
    return (res.body as { accessToken: string }).accessToken
  }

  const createStaff = (token: string, body: Record<string, unknown>) =>
    request(server).post("/staff").set("Authorization", `Bearer ${token}`).send(body)

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    ownerAToken = await signup(slugA)
    ownerBToken = await signup(slugB)

    const receptionist = await createStaff(ownerAToken, {
      name: "Reception",
      email: `reception@${slugA}.local`,
      password,
      role: "receptionist"
    })
    expectStatus(receptionist, 201)
    receptionistToken = await login(slugA, `reception@${slugA}.local`)

    const gatekeeper = await createStaff(ownerAToken, {
      name: "Gatekeeper",
      email: `gatekeeper@${slugA}.local`,
      password,
      role: "dentist"
    })
    expectStatus(gatekeeper, 201)
    dentistToken = await login(slugA, `gatekeeper@${slugA}.local`)
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slugA, slugB] } } })
    await app.close()
  })

  it("lets an owner create a dentist who then shows up in GET /staff", async () => {
    const created = await createStaff(ownerAToken, {
      name: "Dr Malee",
      email: `malee@${slugA}.local`,
      password,
      role: "dentist"
    })
    expectStatus(created, 201)
    const body = created.body as { id: string; name: string; role: string }
    expect(body.name).toBe("Dr Malee")
    expect(body.role).toBe("dentist")

    const list = await request(server)
      .get("/staff?role=dentist")
      .set("Authorization", `Bearer ${ownerAToken}`)
    expectStatus(list, 200)
    const rows = list.body as Array<{ id: string }>
    const listed = rows.find((row) => row.id === body.id)
    expect(listed).toBeDefined()
    expect(Object.keys(created.body as object).sort()).toEqual(Object.keys(listed!).sort())
  })

  it("never echoes the password back", async () => {
    const created = await createStaff(ownerAToken, {
      name: "Dr Quiet",
      email: `quiet@${slugA}.local`,
      password,
      role: "dentist"
    })
    expectStatus(created, 201)
    expect(created.body).not.toHaveProperty("passwordHash")
    expect(created.body).not.toHaveProperty("password")
    expect(created.text).not.toContain("passwordHash")
    expect(created.text).not.toContain(password)
  })

  it("lets the created dentist log in with the password they were given", async () => {
    const created = await createStaff(ownerAToken, {
      name: "Dr Somsak",
      email: `somsak@${slugA}.local`,
      password,
      role: "dentist"
    })
    expectStatus(created, 201)

    const session = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: slugA, email: `somsak@${slugA}.local`, password })
    expectStatus(session, 200)
    expect((session.body as { user: { role: string } }).user.role).toBe("dentist")
  })

  it("refuses a receptionist", async () => {
    const res = await createStaff(receptionistToken, {
      name: "Dr Nope",
      email: `nope-reception@${slugA}.local`,
      password,
      role: "dentist"
    })
    expectStatus(res, 403)
    expect((res.body as { errorCode: string }).errorCode).toBe("FORBIDDEN")
  })

  it("refuses a dentist", async () => {
    const res = await createStaff(dentistToken, {
      name: "Dr Nope",
      email: `nope-dentist@${slugA}.local`,
      password,
      role: "dentist"
    })
    expectStatus(res, 403)
    expect((res.body as { errorCode: string }).errorCode).toBe("FORBIDDEN")
  })

  it("rejects a duplicate email inside the tenant with 409 EMAIL_TAKEN", async () => {
    const first = await createStaff(ownerAToken, {
      name: "Dr First",
      email: sharedEmail,
      password,
      role: "dentist"
    })
    expectStatus(first, 201)

    const second = await createStaff(ownerAToken, {
      name: "Dr Second",
      email: sharedEmail.toUpperCase(),
      password,
      role: "receptionist"
    })
    expectStatus(second, 409)
    expect((second.body as { errorCode: string }).errorCode).toBe("EMAIL_TAKEN")
  })

  it("allows the same email in a different tenant", async () => {
    const res = await createStaff(ownerBToken, {
      name: "Dr Elsewhere",
      email: sharedEmail,
      password,
      role: "dentist"
    })
    expectStatus(res, 201)
  })

  it("rejects role owner with 400", async () => {
    const res = await createStaff(ownerAToken, {
      name: "Second Owner",
      email: `owner2@${slugA}.local`,
      password,
      role: "owner"
    })
    expectStatus(res, 400)
    const users = await prisma.user.findMany({ where: { email: `owner2@${slugA}.local` } })
    expect(users).toHaveLength(0)
  })

  it("rejects a password shorter than eight characters with 400", async () => {
    const res = await createStaff(ownerAToken, {
      name: "Dr Weak",
      email: `weak@${slugA}.local`,
      password: "short",
      role: "dentist"
    })
    expectStatus(res, 400)
  })

  it("cannot hand out a password hash even to code that forgets to select", async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: slugA } })
    const anyone = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id } })
    expect(anyone).not.toHaveProperty("passwordHash")

    const declared = await prisma.user.findFirstOrThrow({
      where: { tenantId: tenant.id },
      omit: { passwordHash: false }
    })
    expect(typeof declared.passwordHash).toBe("string")
  })
})
