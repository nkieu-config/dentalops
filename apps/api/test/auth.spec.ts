import { INestApplication, ValidationPipe } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import cookieParser from "cookie-parser"
import { apiErrorSchema } from "@dentalops/contracts"
import { AppModule } from "../src/app.module"
import { PrismaService } from "../src/prisma/prisma.service"

describe("auth", () => {
  let app: INestApplication
  let prisma: PrismaService
  const slug = `auth-test-${Date.now()}`

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    prisma = app.get(PrismaService)
    await app.init()
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
    const res = await request(app.getHttpServer())
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
    const res = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ ...signupBody, email: "other@authtest.local" })
      .expect(409)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("SLUG_TAKEN")
  })

  it("logs in with correct credentials and sets a refresh cookie", async () => {
    const res = await request(app.getHttpServer())
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
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: "wrong-password" })
      .expect(401)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("INVALID_CREDENTIALS")
  })

  it("serves /auth/me with a valid token and rejects without one", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })
    const me = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200)
    expect(me.body.role).toBe("owner")
    await request(app.getHttpServer()).get("/auth/me").expect(401)
  })

  it("refreshes using the httpOnly cookie", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ clinicSlug: slug, email: signupBody.email, password: signupBody.password })
    const cookies = login.headers["set-cookie"] as unknown as string[]
    const res = await request(app.getHttpServer())
      .post("/auth/refresh")
      .set("Cookie", cookies)
      .expect(200)
    expect(res.body.accessToken).toBeDefined()
  })

  it("demo-login works for every role after seeding", async () => {
    for (const role of ["owner", "receptionist", "dentist"]) {
      const res = await request(app.getHttpServer())
        .post("/auth/demo-login")
        .send({ role })
        .expect(200)
      expect(res.body.user.role).toBe(role)
    }
  })
})
