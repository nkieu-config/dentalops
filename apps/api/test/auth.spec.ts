import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { apiErrorSchema } from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"

describe("auth", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  const slug = `auth-test-${Date.now()}`

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  const signupBody = {
    clinicName: "Auth Test Clinic",
    slug,
    email: "owner@authtest.local",
    password: "s3cure-pass",
    name: "Owner Person"
  }

  it("signs up a new clinic with defaults provisioned", async () => {
    const res = await request(server)
      .post("/auth/signup")
      .send(signupBody)
      .expect(200)
    expect(res.body.accessToken).toBeDefined()
    expect(res.body.user.role).toBe("owner")

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    const [branches, services, chairs] = await Promise.all([
      prisma.branch.count({ where: { tenantId: tenant!.id } }),
      prisma.service.count({ where: { tenantId: tenant!.id } }),
      prisma.resource.count({ where: { tenantId: tenant!.id, type: "chair" } })
    ])
    expect(branches).toBe(1)
    expect(services).toBe(6)
    expect(chairs).toBe(3)
  })

  it("rejects a duplicate slug with SLUG_TAKEN", async () => {
    const res = await request(server)
      .post("/auth/signup")
      .send({ ...signupBody, email: "other@authtest.local" })
      .expect(409)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("SLUG_TAKEN")
  })

  it("logs in with correct credentials and sets a refresh cookie", async () => {
    const res = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })
      .expect(200)
    expect(res.body.accessToken).toBeDefined()
    const cookies = res.headers["set-cookie"] as unknown as string[]
    expect(cookies.some((c) => c.startsWith("dentalops_refresh=") && c.includes("HttpOnly"))).toBe(
      true
    )
  })

  it("rejects a wrong password with INVALID_CREDENTIALS", async () => {
    const res = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: "wrong-password" })
      .expect(401)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("INVALID_CREDENTIALS")
  })

  it("serves /auth/me with a valid token and rejects without one", async () => {
    const login = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })
    const me = await request(server)
      .get("/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200)
    expect(me.body.role).toBe("owner")
    await request(server).get("/auth/me").expect(401)
  })

  it("refreshes using the httpOnly cookie", async () => {
    const login = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })
    const cookies = login.headers["set-cookie"] as unknown as string[]
    const res = await request(server)
      .post("/auth/refresh")
      .set("Cookie", cookies)
      .expect(200)
    expect(res.body.accessToken).toBeDefined()
  })

  it("rejects a replayed refresh token after it has been rotated out", async () => {
    const login = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })
    const firstCookies = login.headers["set-cookie"] as unknown as string[]

    const rotated = await request(server)
      .post("/auth/refresh")
      .set("Cookie", firstCookies)
      .expect(200)
    const secondCookies = rotated.headers["set-cookie"] as unknown as string[]
    expect(secondCookies[0]).not.toBe(firstCookies[0])

    const replay = await request(server)
      .post("/auth/refresh")
      .set("Cookie", firstCookies)
      .expect(401)
    expect(apiErrorSchema.parse(replay.body).errorCode).toBe("INVALID_REFRESH_TOKEN")

    await request(server).post("/auth/refresh").set("Cookie", secondCookies).expect(200)
  })

  it("keeps each device's session independent, so a second login never signs the first one out", async () => {
    const login = () =>
      request(server)
        .post("/auth/login")
        .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })

    const desktop = await login()
    const tablet = await login()
    const desktopCookies = desktop.headers["set-cookie"] as unknown as string[]
    const tabletCookies = tablet.headers["set-cookie"] as unknown as string[]

    await request(server).post("/auth/refresh").set("Cookie", desktopCookies).expect(200)
    await request(server).post("/auth/refresh").set("Cookie", tabletCookies).expect(200)
  })

  it("logs out one device without ending the other device's session", async () => {
    const login = () =>
      request(server)
        .post("/auth/login")
        .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })

    const staying = await login()
    const leaving = await login()
    const stayingCookies = staying.headers["set-cookie"] as unknown as string[]
    const leavingCookies = leaving.headers["set-cookie"] as unknown as string[]

    await request(server).post("/auth/logout").set("Cookie", leavingCookies).expect(204)

    await request(server).post("/auth/refresh").set("Cookie", leavingCookies).expect(401)
    await request(server).post("/auth/refresh").set("Cookie", stayingCookies).expect(200)
  })

  it("logs out by clearing the refresh cookie and revoking the session server-side", async () => {
    const login = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })
    const cookies = login.headers["set-cookie"] as unknown as string[]

    const out = await request(server).post("/auth/logout").set("Cookie", cookies).expect(204)
    const cleared = out.headers["set-cookie"] as unknown as string[]
    expect(cleared.some((c) => c.startsWith("dentalops_refresh=;"))).toBe(true)

    const res = await request(server).post("/auth/refresh").set("Cookie", cookies).expect(401)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("INVALID_REFRESH_TOKEN")
  })

  it("logout is a no-op with no cookie and never 500s", async () => {
    await request(server).post("/auth/logout").expect(204)
  })

  it("demo-login works for every role after seeding", async () => {
    for (const role of ["owner", "receptionist", "dentist"]) {
      const res = await request(server)
        .post("/auth/demo-login")
        .send({ role })
        .expect(200)
      expect(res.body.user.role).toBe(role)
    }
  })
})
