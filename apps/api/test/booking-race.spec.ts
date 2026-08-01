import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { apiErrorSchema } from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("booking races", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let branchId: string
  let patientId: string
  let serviceId: string
  const dentists: string[] = []
  const slug = `booking-race-${Date.now()}`

  const at = (day: number, h: number) => new Date(Date.UTC(2027, 0, day, h, 0, 0)).toISOString()

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Booking Race Test Clinic",
      slug,
      email: "owner@booking-race.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    const tenantId = tenant!.id
    const branch = await prisma.branch.findFirst({ where: { tenantId } })
    branchId = branch!.id

    const chairs = await prisma.resource.count({ where: { branchId, type: "chair", isActive: true } })
    expect(chairs).toBe(3)

    const argon2 = await import("argon2")
    const passwordHash = await argon2.hash("s3cure-pass")
    for (const n of [1, 2, 3, 4]) {
      const dentist = await prisma.user.create({
        data: {
          tenantId,
          email: `dentist${n}@booking-race.local`,
          passwordHash,
          name: `Dr. Racer ${n}`,
          role: "dentist"
        }
      })
      dentists.push(dentist.id)
    }

    const patient = await prisma.patient.create({
      data: {
        tenantId,
        name: "Ratchanee Prasert",
        phone: "0844455566",
        email: "patient@booking-race.local"
      }
    })
    patientId = patient.id

    const service = await prisma.service.create({
      data: { tenantId, name: "Scaling", durationMin: 30, bufferMin: 0 }
    })
    serviceId = service.id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("20 concurrent bookings for one dentist slot: exactly one wins", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(server)
          .post("/appointments")
          .set("Authorization", `Bearer ${ownerToken}`)
          .send({ serviceId, dentistId: dentists[0], patientId, branchId, startsAt: at(4, 9) })
      )
    )
    const byStatus = results.reduce<Record<number, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    }, {})
    expect(byStatus[201]).toBe(1)
    expect(byStatus[409]).toBe(19)
    const count = await prisma.appointment.count({
      where: { dentistId: dentists[0], status: "confirmed" }
    })
    expect(count).toBe(1)
  })

  it("4 concurrent bookings, 3 chairs: exactly three win and take distinct chairs", async () => {
    const results = await Promise.all(
      dentists.map((dentistId) =>
        request(server)
          .post("/appointments")
          .set("Authorization", `Bearer ${ownerToken}`)
          .send({ serviceId, dentistId, patientId, branchId, startsAt: at(5, 9) })
      )
    )
    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual([201, 201, 201, 409])
    const loser = results.find((r) => r.status === 409)
    expect(apiErrorSchema.parse(loser!.body).errorCode).toBe("RESOURCE_UNAVAILABLE")
    const claims = await prisma.resourceClaim.findMany({
      where: { status: "active", startsAt: new Date(at(5, 9)) }
    })
    const chairIds = new Set(claims.map((c) => c.resourceId))
    expect(chairIds.size).toBe(3)
  })
})
