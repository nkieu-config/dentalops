import { INestApplication } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import { availabilityResponseSchema } from "@dentalops/contracts"
import type Redis from "ioredis"
import type { Server } from "node:http"
import request from "supertest"
import { holdKey, slotKey, spannedSlotIndexes } from "../src/holds/holds.service"
import { PrismaService } from "../src/prisma/prisma.service"
import { REDIS } from "../src/redis/redis.module"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"
import { secretFor } from "../src/auth/token-secrets"

const THROTTLER_KEY_PATTERN = "*:default}:*"
const BKK_DATE = "2027-06-07"
const TIE_DATE = "2027-06-08"
const DURATION_MIN = 45

const utcOn = (day: number, hour: number, minute = 0) =>
  new Date(Date.UTC(2027, 5, day, hour, minute)).toISOString()
const utc = (hour: number, minute = 0) => utcOn(7, hour, minute)

interface Clinic {
  slug: string
  tenantId: string
  branchId: string
  serviceId: string
  dentistId: string
  ownerToken: string
}

interface PairClinic {
  slug: string
  tenantId: string
  branchId: string
  serviceId: string
  busyDentistId: string
  lightDentistId: string
}

interface PublicAppointment {
  id: string
  status: string
  startsAt: string
  endsAt: string
  branch: { id: string; name: string }
  service: { id: string; name: string; durationMin: number }
  dentist: { id: string; name: string }
  patient: { id: string; name: string }
}

interface ConfirmResponse {
  appointment: PublicAppointment
  manageToken: string
}

describe("public booking confirm and manage links", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let redis: Redis
  let jwt: JwtService
  let alpha: Clinic
  let beta: Clinic
  let gamma: PairClinic
  const alphaSlug = `book-alpha-${Date.now()}`
  const betaSlug = `book-beta-${Date.now()}`
  const gammaSlug = `book-gamma-${Date.now()}`

  const clearThrottleState = async () => {
    const keys = await redis.keys(THROTTLER_KEY_PATTERN)
    if (keys.length > 0) await redis.del(...keys)
  }

  const provision = async (slug: string, email: string): Promise<Clinic> => {
    const signup = await request(server).post("/auth/signup").send({
      clinicName: `Booking ${slug}`,
      slug,
      email,
      password: "s3cure-pass",
      name: "Booking Owner"
    })
    expectStatus(signup, 200)
    const tenantId = signup.body.user.tenantId as string

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } })
    const service = await prisma.service.create({
      data: { tenantId, name: "Booking Probe", durationMin: DURATION_MIN, bufferMin: 0 }
    })
    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: `dentist@${slug}.local`,
        passwordHash: "x",
        name: "Dr. Booking",
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
    return {
      slug,
      tenantId,
      branchId: branch.id,
      serviceId: service.id,
      dentistId: dentist.id,
      ownerToken: signup.body.accessToken as string
    }
  }

  const provisionPair = async (slug: string, email: string): Promise<PairClinic> => {
    const signup = await request(server).post("/auth/signup").send({
      clinicName: `Load ${slug}`,
      slug,
      email,
      password: "s3cure-pass",
      name: "Load Owner"
    })
    expectStatus(signup, 200)
    const tenantId = signup.body.user.tenantId as string

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } })
    const service = await prisma.service.create({
      data: { tenantId, name: "Load Probe", durationMin: DURATION_MIN, bufferMin: 0 }
    })
    const [busy, light] = await Promise.all(
      ["Dr. Busy", "Dr. Light"].map((name, index) =>
        prisma.user.create({
          data: {
            tenantId,
            email: `dentist-${index}@${slug}.local`,
            passwordHash: "x",
            name,
            role: "dentist"
          }
        })
      )
    )
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        name: "Load Patient",
        phone: "0800000000",
        email: `load@${slug}.local`
      }
    })

    await prisma.shift.createMany({
      data: [busy!.id, light!.id].flatMap((staffId) =>
        [7, 8].map((day) => ({
          tenantId,
          staffId,
          branchId: branch.id,
          startsAt: new Date(utcOn(day, 2)),
          endsAt: new Date(utcOn(day, 13))
        }))
      )
    })

    const book = (
      dentistId: string,
      day: number,
      hour: number,
      status: "confirmed" | "cancelled"
    ) =>
      prisma.appointment.create({
        data: {
          tenantId,
          branchId: branch.id,
          serviceId: service.id,
          dentistId,
          patientId: patient.id,
          startsAt: new Date(utcOn(day, hour)),
          endsAt: new Date(utcOn(day, hour, 45)),
          status
        }
      })

    await Promise.all([
      book(busy!.id, 7, 2, "confirmed"),
      book(busy!.id, 7, 3, "confirmed"),
      book(busy!.id, 7, 4, "confirmed"),
      book(light!.id, 7, 2, "confirmed"),
      book(light!.id, 7, 3, "cancelled"),
      book(light!.id, 7, 4, "cancelled"),
      book(light!.id, 7, 5, "cancelled"),
      book(busy!.id, 8, 2, "confirmed"),
      book(light!.id, 8, 2, "confirmed")
    ])

    return {
      slug,
      tenantId,
      branchId: branch.id,
      serviceId: service.id,
      busyDentistId: busy!.id,
      lightDentistId: light!.id
    }
  }

  const publicSlots = async (clinic: PairClinic, date: string, dentistId?: string) => {
    const res = await request(server)
      .get(`/public/${clinic.slug}/availability`)
      .query({
        serviceId: clinic.serviceId,
        branchId: clinic.branchId,
        date,
        ...(dentistId ? { dentistId } : {})
      })
    expectStatus(res, 200)
    return availabilityResponseSchema.parse(res.body).slots
  }

  const startsOf = async (clinic: Clinic) => {
    const res = await request(server).get(`/public/${clinic.slug}/availability`).query({
      serviceId: clinic.serviceId,
      branchId: clinic.branchId,
      dentistId: clinic.dentistId,
      date: BKK_DATE
    })
    expectStatus(res, 200)
    return availabilityResponseSchema.parse(res.body).slots.map((slot) => slot.startsAt)
  }

  const acquire = async (clinic: Clinic, startsAt: string): Promise<string> => {
    const res = await request(server).post(`/public/${clinic.slug}/holds`).send({
      serviceId: clinic.serviceId,
      branchId: clinic.branchId,
      dentistId: clinic.dentistId,
      startsAt
    })
    expectStatus(res, 201)
    return (res.body as { holdId: string }).holdId
  }

  const confirm = (
    clinic: Clinic,
    holdId: string,
    patient: { name: string; phone: string; email?: string }
  ) => request(server).post(`/public/${clinic.slug}/appointments`).send({ holdId, ...patient })

  const bookAsStaff = (clinic: Clinic, patientId: string, startsAt: string) =>
    request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${clinic.ownerToken}`)
      .send({
        serviceId: clinic.serviceId,
        branchId: clinic.branchId,
        dentistId: clinic.dentistId,
        patientId,
        startsAt
      })

  const signManageToken = (payload: Record<string, unknown>) =>
    jwt.signAsync(payload, { secret: secretFor("manage"), expiresIn: "30d" })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    redis = app.get<Redis>(REDIS)
    jwt = app.get(JwtService)
    await clearThrottleState()
    alpha = await provision(alphaSlug, "owner@book-alpha.local")
    beta = await provision(betaSlug, "owner@book-beta.local")
    gamma = await provisionPair(gammaSlug, "owner@book-gamma.local")
  })

  afterAll(async () => {
    await clearThrottleState()
    await prisma.tenant.deleteMany({
      where: { slug: { in: [alphaSlug, betaSlug, gammaSlug] } }
    })
    await app.close()
  })

  beforeEach(async () => {
    await clearThrottleState()
  })

  it("hands every any-dentist slot to the dentist carrying the fewest confirmed minutes", async () => {
    const slots = await publicSlots(gamma, BKK_DATE)

    expect(slots.length).toBeGreaterThan(0)
    expect(new Set(slots.map((slot) => slot.dentistId))).toEqual(
      new Set([gamma.lightDentistId])
    )
    expect(new Set(slots.map((slot) => slot.startsAt)).size).toBe(slots.length)

    const lightAlone = await publicSlots(gamma, BKK_DATE, gamma.lightDentistId)
    expect(slots.map((slot) => slot.startsAt)).toEqual(
      lightAlone.map((slot) => slot.startsAt)
    )
  })

  it("returns the named dentist's own slots untouched when the patient chose one", async () => {
    const slots = await publicSlots(gamma, BKK_DATE, gamma.busyDentistId)

    expect(slots.length).toBeGreaterThan(0)
    expect(new Set(slots.map((slot) => slot.dentistId))).toEqual(new Set([gamma.busyDentistId]))
    expect(slots[0]!.startsAt).toBe(utc(4, 45))
    expect(slots.map((slot) => slot.startsAt)).toContain(utc(5))
  })

  it("breaks an equal load on dentistId so the assignment never flaps", async () => {
    const slots = await publicSlots(gamma, TIE_DATE)
    const lowest = [gamma.busyDentistId, gamma.lightDentistId].sort()[0]

    expect(slots.length).toBeGreaterThan(0)
    expect(new Set(slots.map((slot) => slot.dentistId))).toEqual(new Set([lowest]))
  })

  it("confirms a held slot into a booking, consumes the hold, and returns a manage token", async () => {
    const startsAt = utc(2)
    expect(await startsOf(alpha)).toContain(startsAt)

    const holdId = await acquire(alpha, startsAt)
    const res = await confirm(alpha, holdId, {
      name: "Napat Booking",
      phone: "0810000001",
      email: "napat@example.com"
    })
    expectStatus(res, 201)
    const body = res.body as ConfirmResponse

    expect(body.appointment.status).toBe("confirmed")
    expect(body.appointment.startsAt).toBe(startsAt)
    expect(body.appointment.endsAt).toBe(utc(2, 45))
    expect(body.appointment.dentist.id).toBe(alpha.dentistId)
    expect(body.appointment.branch.id).toBe(alpha.branchId)
    expect(body.appointment.service.durationMin).toBe(DURATION_MIN)
    expect(body.appointment.patient.name).toBe("Napat Booking")
    expect(typeof body.manageToken).toBe("string")
    expect(body.manageToken.split(".")).toHaveLength(3)

    const stored = await prisma.appointment.findUniqueOrThrow({
      where: { id: body.appointment.id }
    })
    expect(stored.tenantId).toBe(alpha.tenantId)
    expect(stored.status).toBe("confirmed")

    expect(await redis.get(holdKey(holdId))).toBeNull()
    const spanned = spannedSlotIndexes(Date.parse(startsAt), Date.parse(utc(2, 45)))
    for (const index of spanned) {
      expect(await redis.get(slotKey(alpha.tenantId, alpha.dentistId, index))).toBeNull()
    }

    expect(await startsOf(alpha)).not.toContain(startsAt)
  })

  it("rejects a second confirm on the same hold with HOLD_EXPIRED", async () => {
    const holdId = await acquire(alpha, utc(3))
    const first = await confirm(alpha, holdId, { name: "Twice Once", phone: "0810000002" })
    expectStatus(first, 201)

    const second = await confirm(alpha, holdId, { name: "Twice Again", phone: "0810000003" })
    expectStatus(second, 409)
    expect(second.body.errorCode).toBe("HOLD_EXPIRED")
  })

  it("rejects a confirm whose hold was released with HOLD_EXPIRED", async () => {
    const holdId = await acquire(alpha, utc(4))
    const released = await request(server).delete(`/public/${alpha.slug}/holds/${holdId}`)
    expectStatus(released, 204)

    const res = await confirm(alpha, holdId, { name: "Gone Hold", phone: "0810000004" })
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("HOLD_EXPIRED")
    expect(await startsOf(alpha)).toContain(utc(4))
  })

  it("rejects a confirm whose hold belongs to another clinic with HOLD_EXPIRED", async () => {
    const holdId = await acquire(beta, utc(4))
    const res = await confirm(alpha, holdId, { name: "Wrong Clinic", phone: "0810000005" })
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("HOLD_EXPIRED")
    await request(server).delete(`/public/${beta.slug}/holds/${holdId}`)
  })

  it("upserts one patient per phone and keeps the name from the first booking", async () => {
    const phone = "0819999999"
    const first = await confirm(alpha, await acquire(alpha, utc(5)), {
      name: "Original Name",
      phone,
      email: "original@example.com"
    })
    expectStatus(first, 201)

    const second = await confirm(alpha, await acquire(alpha, utc(5, 45)), {
      name: "Renamed Later",
      phone,
      email: "renamed@example.com"
    })
    expectStatus(second, 201)

    const patients = await prisma.patient.findMany({ where: { tenantId: alpha.tenantId, phone } })
    expect(patients).toHaveLength(1)
    expect(patients[0]!.name).toBe("Original Name")
    expect(patients[0]!.email).toBe("original@example.com")

    const firstBody = first.body as ConfirmResponse
    const secondBody = second.body as ConfirmResponse
    expect(secondBody.appointment.patient.id).toBe(firstBody.appointment.patient.id)
    expect(secondBody.appointment.patient.name).toBe("Original Name")
  })

  it("keeps phones separate per tenant so an upsert never crosses clinics", async () => {
    const phone = "0818888888"
    expectStatus(
      await confirm(alpha, await acquire(alpha, utc(9, 45)), { name: "Alpha Patient", phone }),
      201
    )
    expectStatus(
      await confirm(beta, await acquire(beta, utc(9, 45)), { name: "Beta Patient", phone }),
      201
    )

    const rows = await prisma.patient.findMany({ where: { phone }, orderBy: { name: "asc" } })
    expect(rows.map((r) => r.name)).toEqual(["Alpha Patient", "Beta Patient"])
    expect(new Set(rows.map((r) => r.tenantId))).toEqual(
      new Set([alpha.tenantId, beta.tenantId])
    )
  })

  it("returns SLOT_CONFLICT when staff book the held slot before the patient confirms", async () => {
    const startsAt = utc(6, 45)
    const holdId = await acquire(alpha, startsAt)

    const walkIn = await prisma.patient.create({
      data: {
        tenantId: alpha.tenantId,
        name: "Walk In",
        phone: "0817777777",
        email: "walkin@example.com"
      }
    })
    const staffBooking = await bookAsStaff(alpha, walkIn.id, startsAt)
    expectStatus(staffBooking, 201)

    const res = await confirm(alpha, holdId, { name: "Beaten Patient", phone: "0810000006" })
    expectStatus(res, 409)
    expect(res.body.errorCode).toBe("SLOT_CONFLICT")
    expect(res.body.details.conflictingAppointmentId).toBe(staffBooking.body.id)

    const patients = await prisma.patient.findMany({
      where: { tenantId: alpha.tenantId, phone: "0810000006" }
    })
    expect(patients).toHaveLength(1)
  })

  it("views a booking through its manage link", async () => {
    const startsAt = utc(7, 45)
    const created = await confirm(alpha, await acquire(alpha, startsAt), {
      name: "Manage Me",
      phone: "0810000007",
      email: "manage@example.com"
    })
    expectStatus(created, 201)
    const { appointment, manageToken } = created.body as ConfirmResponse

    const res = await request(server).get(`/public/manage/${manageToken}`)
    expectStatus(res, 200)
    const view = res.body as PublicAppointment
    expect(view.id).toBe(appointment.id)
    expect(view.status).toBe("confirmed")
    expect(view.startsAt).toBe(startsAt)
    expect(view.patient.name).toBe("Manage Me")
    expect(view.dentist.name).toBe("Dr. Booking")
  })

  it("rejects any token whose purpose is not manage", async () => {
    const created = await confirm(alpha, await acquire(alpha, utc(8, 45)), {
      name: "Purpose Guard",
      phone: "0810000008"
    })
    expectStatus(created, 201)
    const { appointment } = created.body as ConfirmResponse

    const accessPurpose = await signManageToken({
      sub: appointment.id,
      tenantId: alpha.tenantId,
      purpose: "access"
    })
    const noPurpose = await signManageToken({ sub: appointment.id, tenantId: alpha.tenantId })
    const login = await request(server)
      .post("/auth/login")
      .send({ clinicSlug: alpha.slug, email: "owner@book-alpha.local", password: "s3cure-pass" })
    expectStatus(login, 200)

    for (const token of [accessPurpose, noPurpose, login.body.accessToken as string]) {
      const res = await request(server).get(`/public/manage/${token}`)
      expectStatus(res, 401)
      expect(res.body.errorCode).toBe("INVALID_MANAGE_TOKEN")

      const cancel = await request(server).post(`/public/manage/${token}/cancel`)
      expectStatus(cancel, 401)
      expect(cancel.body.errorCode).toBe("INVALID_MANAGE_TOKEN")
    }

    const stillConfirmed = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id }
    })
    expect(stillConfirmed.status).toBe("confirmed")
  })

  it("rejects a garbage or unsigned manage token", async () => {
    const res = await request(server).get("/public/manage/not-a-real-token")
    expectStatus(res, 401)
    expect(res.body.errorCode).toBe("INVALID_MANAGE_TOKEN")
  })

  it("never lets a manage token for one tenant read another tenant's appointment", async () => {
    const betaBooking = await confirm(beta, await acquire(beta, utc(7)), {
      name: "Beta Secret",
      phone: "0810000009",
      email: "beta@example.com"
    })
    expectStatus(betaBooking, 201)
    const target = (betaBooking.body as ConfirmResponse).appointment

    const forged = await signManageToken({
      sub: target.id,
      tenantId: alpha.tenantId,
      purpose: "manage"
    })

    const res = await request(server).get(`/public/manage/${forged}`)
    expectStatus(res, 404)
    expect(res.body.errorCode).toBe("NOT_FOUND")
    expect(JSON.stringify(res.body)).not.toContain("Beta Secret")

    const cancel = await request(server).post(`/public/manage/${forged}/cancel`)
    expectStatus(cancel, 404)
    const untouched = await prisma.appointment.findUniqueOrThrow({ where: { id: target.id } })
    expect(untouched.status).toBe("confirmed")
  })

  it("cancels through the manage link and frees the slot", async () => {
    const startsAt = utc(11)
    const created = await confirm(alpha, await acquire(alpha, startsAt), {
      name: "Cancel Me",
      phone: "0810000010"
    })
    expectStatus(created, 201)
    const { appointment, manageToken } = created.body as ConfirmResponse
    expect(await startsOf(alpha)).not.toContain(startsAt)

    const res = await request(server).post(`/public/manage/${manageToken}/cancel`)
    expectStatus(res, 204)

    const stored = await prisma.appointment.findUniqueOrThrow({ where: { id: appointment.id } })
    expect(stored.status).toBe("cancelled")

    const claims = await prisma.resourceClaim.findMany({
      where: { appointmentId: appointment.id }
    })
    expect(claims.every((claim) => claim.status === "released")).toBe(true)

    expect(await startsOf(alpha)).toContain(startsAt)

    const view = await request(server).get(`/public/manage/${manageToken}`)
    expectStatus(view, 200)
    expect((view.body as PublicAppointment).status).toBe("cancelled")
  })
})
