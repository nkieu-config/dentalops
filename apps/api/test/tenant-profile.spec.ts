import { INestApplication } from "@nestjs/common"
import type { Server } from "node:http"
import request from "supertest"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("tenant profile", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService

  const stamp = Date.now()
  const slugA = `tenant-a-${stamp}`
  const slugB = `tenant-b-${stamp}`
  let ownerAToken: string
  let ownerBToken: string
  let receptionistToken: string

  const signup = async (slug: string, name: string) => {
    const response = await request(server).post("/auth/signup").send({
      clinicName: name,
      slug,
      email: `owner@${slug}.local`,
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(response, 200)
    return (response.body as { accessToken: string }).accessToken
  }

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    ownerAToken = await signup(slugA, "Alpha Dental")
    ownerBToken = await signup(slugB, "Bravo Dental")

    const staff = await request(server).post("/staff").set("Authorization", `Bearer ${ownerAToken}`).send({
      name: "Reception",
      email: `reception@${slugA}.local`,
      password: "s3cure-pass",
      role: "receptionist"
    })
    expectStatus(staff, 201)

    const session = await request(server).post("/auth/login").send({
      clinicSlug: slugA,
      email: `reception@${slugA}.local`,
      password: "s3cure-pass"
    })
    expectStatus(session, 200)
    receptionistToken = (session.body as { accessToken: string }).accessToken
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { in: [slugA, slugB, `${slugA}-new`] } } })
    await app.close()
  })

  it("returns only the authenticated owner's clinic profile", async () => {
    const alpha = await request(server).get("/tenant").set("Authorization", `Bearer ${ownerAToken}`)
    expectStatus(alpha, 200)
    expect(alpha.body).toMatchObject({ name: "Alpha Dental", slug: slugA, publicBookingPath: `/book/${slugA}` })

    const bravo = await request(server).get("/tenant").set("Authorization", `Bearer ${ownerBToken}`)
    expectStatus(bravo, 200)
    expect(bravo.body).toMatchObject({ name: "Bravo Dental", slug: slugB, publicBookingPath: `/book/${slugB}` })
    expect(bravo.body.id).not.toBe(alpha.body.id)
  })

  it("lets an owner rename the clinic and public booking path", async () => {
    const response = await request(server)
      .patch("/tenant")
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ name: "Alpha Smiles", slug: `${slugA}-new` })

    expectStatus(response, 200)
    expect(response.body).toMatchObject({
      name: "Alpha Smiles",
      slug: `${slugA}-new`,
      publicBookingPath: `/book/${slugA}-new`
    })
  })

  it("rejects a slug already used by another clinic with SLUG_TAKEN", async () => {
    const response = await request(server)
      .patch("/tenant")
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ slug: slugB })

    expectStatus(response, 409)
    expect(response.body).toMatchObject({ errorCode: "SLUG_TAKEN" })
  })

  it("rejects a clinic name that becomes empty after trimming", async () => {
    const response = await request(server)
      .patch("/tenant")
      .set("Authorization", `Bearer ${ownerAToken}`)
      .send({ name: "   " })

    expectStatus(response, 400)
  })

  it("does not let a receptionist read or change clinic settings", async () => {
    const read = await request(server).get("/tenant").set("Authorization", `Bearer ${receptionistToken}`)
    expectStatus(read, 403)

    const update = await request(server)
      .patch("/tenant")
      .set("Authorization", `Bearer ${receptionistToken}`)
      .send({ name: "Nope" })
    expectStatus(update, 403)
  })
})
