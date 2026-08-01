import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { apiErrorSchema } from "@dentalops/contracts"
import { PrismaService } from "../src/prisma/prisma.service"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

describe("reschedule and status transitions", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let ownerToken: string
  let branchId: string
  let dentistId: string
  let dentist2Id: string
  let patientId: string
  let serviceId: string
  let apptId: string
  let cancelledId: string
  const slug = `reschedule-api-${Date.now()}`

  const at = (day: number, h: number, m = 0) =>
    new Date(Date.UTC(2026, 10, day, h, m, 0)).toISOString()

  const book = (dentist: string, startsAt: string) =>
    request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ serviceId, dentistId: dentist, patientId, branchId, startsAt })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)

    const signup = await request(server).post("/auth/signup").send({
      clinicName: "Reschedule Test Clinic",
      slug,
      email: "owner@reschedule.local",
      password: "s3cure-pass",
      name: "Owner"
    })
    expectStatus(signup, 200)
    ownerToken = signup.body.accessToken

    const tenant = await prisma.tenant.findUnique({ where: { slug } })
    const tenantId = tenant!.id
    const branch = await prisma.branch.findFirst({ where: { tenantId } })
    branchId = branch!.id

    const argon2 = await import("argon2")
    const passwordHash = await argon2.hash("s3cure-pass")
    const dentists = await Promise.all(
      [1, 2].map((n) =>
        prisma.user.create({
          data: {
            tenantId,
            email: `dentist${n}@reschedule.local`,
            passwordHash,
            name: `Dr. Number ${n}`,
            role: "dentist"
          }
        })
      )
    )
    dentistId = dentists[0]!.id
    dentist2Id = dentists[1]!.id

    const patient = await prisma.patient.create({
      data: {
        tenantId,
        name: "Malee Sukjai",
        phone: "0898765432",
        email: "patient@reschedule.local"
      }
    })
    patientId = patient.id

    const service = await prisma.service.create({
      data: { tenantId, name: "Crown Fitting", durationMin: 60, bufferMin: 15 }
    })
    serviceId = service.id

    const created = await book(dentistId, at(2, 9)).expect(201)
    apptId = created.body.id
  })

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug } })
    await app.close()
  })

  it("reschedule moves the appointment and reissues claims", async () => {
    const res = await request(server)
      .patch(`/appointments/${apptId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ version: 0, startsAt: at(2, 11) })
      .expect(200)

    expect(res.body.startsAt).toBe(at(2, 11))
    expect(res.body.endsAt).toBe(at(2, 12))
    expect(res.body.version).toBe(1)
    expect(res.body.claims.length).toBe(1)
    expect(res.body.claims[0].startsAt).toBe(at(2, 11))
    expect(new Date(res.body.claims[0].endsAt).getTime()).toBe(
      new Date(at(2, 11)).getTime() + 75 * 60_000
    )

    const released = await prisma.resourceClaim.findMany({
      where: { appointmentId: apptId, status: "released" }
    })
    expect(released.length).toBe(1)
    expect(released[0]!.startsAt.toISOString()).toBe(at(2, 9))

    await book(dentist2Id, at(2, 9)).expect(201)
  })

  it("stale version is rejected with STALE_VERSION", async () => {
    const res = await request(server)
      .patch(`/appointments/${apptId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ version: 0, startsAt: at(2, 14) })
      .expect(409)

    const error = apiErrorSchema.parse(res.body)
    expect(error.errorCode).toBe("STALE_VERSION")
    expect((error.details as { currentVersion: number }).currentVersion).toBe(1)

    const unchanged = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } })
    expect(unchanged.startsAt.toISOString()).toBe(at(2, 11))
    expect(unchanged.version).toBe(1)
  })

  it("reschedule into another dentist's slot returns SLOT_CONFLICT", async () => {
    await book(dentist2Id, at(3, 13)).expect(201)

    const res = await request(server)
      .patch(`/appointments/${apptId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ version: 1, startsAt: at(3, 13), dentistId: dentist2Id })
      .expect(409)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("SLOT_CONFLICT")

    const unchanged = await prisma.appointment.findUniqueOrThrow({ where: { id: apptId } })
    expect(unchanged.dentistId).toBe(dentistId)
    expect(unchanged.version).toBe(1)
  })

  it("completed keeps the chair claim active", async () => {
    const res = await request(server)
      .patch(`/appointments/${apptId}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "completed" })
      .expect(200)
    expect(res.body.status).toBe("completed")
    expect(res.body.claims.length).toBe(1)

    const active = await prisma.resourceClaim.findMany({
      where: { appointmentId: apptId, status: "active" }
    })
    expect(active.length).toBe(1)

    const rebooked = await book(dentistId, at(2, 11)).expect(201)
    expect(rebooked.body.claims[0].resourceId).not.toBe(active[0]!.resourceId)
  })

  it("cancelled releases claims and frees the exact slot", async () => {
    const created = await book(dentistId, at(4, 15)).expect(201)
    cancelledId = created.body.id
    const chairId = created.body.claims[0].resourceId

    const cancelled = await request(server)
      .patch(`/appointments/${cancelledId}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "cancelled" })
      .expect(200)
    expect(cancelled.body.status).toBe("cancelled")
    expect(cancelled.body.claims.length).toBe(0)

    const active = await prisma.resourceClaim.count({
      where: { appointmentId: cancelledId, status: "active" }
    })
    expect(active).toBe(0)

    const rebooked = await book(dentistId, at(4, 15)).expect(201)
    expect(rebooked.body.claims[0].resourceId).toBe(chairId)
  })

  it("INVALID_TRANSITION on double status change", async () => {
    const res = await request(server)
      .patch(`/appointments/${cancelledId}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "cancelled" })
      .expect(409)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("INVALID_TRANSITION")
  })

  it("moving a cancelled appointment is NOT_CONFIRMED", async () => {
    const current = await prisma.appointment.findUniqueOrThrow({ where: { id: cancelledId } })
    const res = await request(server)
      .patch(`/appointments/${cancelledId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ version: current.version, startsAt: at(5, 9) })
      .expect(409)
    expect(apiErrorSchema.parse(res.body).errorCode).toBe("NOT_CONFIRMED")
  })

  it("resizes via durationMin and a later move preserves the resized duration", async () => {
    const created = await book(dentistId, at(20, 2))
    expectStatus(created, 201)

    const resized = await request(server)
      .patch(`/appointments/${created.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ version: created.body.version, durationMin: 90 })
    expectStatus(resized, 200)
    expect(Date.parse(resized.body.endsAt) - Date.parse(resized.body.startsAt)).toBe(90 * 60_000)

    const moved = await request(server)
      .patch(`/appointments/${created.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ version: resized.body.version, startsAt: at(20, 5) })
    expectStatus(moved, 200)
    expect(moved.body.startsAt).toBe(at(20, 5))
    expect(Date.parse(moved.body.endsAt) - Date.parse(moved.body.startsAt)).toBe(90 * 60_000)
  })

  it("a conflicting reschedule names the appointment it collided with", async () => {
    const blocker = await book(dentistId, at(21, 2))
    expectStatus(blocker, 201)
    const victim = await book(dentistId, at(21, 6))
    expectStatus(victim, 201)

    const res = await request(server)
      .patch(`/appointments/${victim.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ version: victim.body.version, startsAt: at(21, 2, 30) })
    expect(res.status).toBe(409)

    const parsed = apiErrorSchema.parse(res.body)
    expect(parsed.errorCode).toBe("SLOT_CONFLICT")
    expect((parsed.details as { conflictingAppointmentId?: string }).conflictingAppointmentId).toBe(
      blocker.body.id
    )
  })

  it("never names the moving appointment as its own conflict", async () => {
    const blocker = await book(dentistId, at(22, 4))
    expectStatus(blocker, 201)
    const victim = await book(dentistId, at(22, 3))
    expectStatus(victim, 201)

    const res = await request(server)
      .patch(`/appointments/${victim.body.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ version: victim.body.version, startsAt: at(22, 3, 30) })
    expect(res.status).toBe(409)

    const details = apiErrorSchema.parse(res.body).details as {
      conflictingAppointmentId?: string
    }
    expect(details.conflictingAppointmentId).not.toBe(victim.body.id)
    expect(details.conflictingAppointmentId).toBe(blocker.body.id)
  })
})
