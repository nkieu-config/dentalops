import { INestApplication } from "@nestjs/common"
import type Redis from "ioredis"
import type { AddressInfo } from "node:net"
import type { Server } from "node:http"
import { io, Socket } from "socket.io-client"
import request from "supertest"
import { PrismaService } from "../src/prisma/prisma.service"
import {
  APPOINTMENT_CHANGED,
  AppointmentChangedEvent,
  branchRoom,
  REALTIME_NAMESPACE,
  SUBSCRIBE,
  SubscribeAck
} from "../src/realtime/realtime.events"
import { REDIS } from "../src/redis/redis.module"
import { createTestApp } from "./utils/test-app"
import { expectStatus } from "./utils/expect-status"

const THROTTLER_KEY_PATTERN = "*:default}:*"
const DURATION_MIN = 30
const SETTLE_MS = 400

const utc = (hour: number, minute = 0) => new Date(Date.UTC(2027, 6, 5, hour, minute)).toISOString()

interface Clinic {
  slug: string
  tenantId: string
  branchId: string
  serviceId: string
  dentistId: string
  patientId: string
  ownerToken: string
}

const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS))

const waitFor = async <T>(
  read: () => T | undefined,
  what: string,
  timeoutMs = 10_000
): Promise<T> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = read()
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`timed out waiting for ${what}`)
}

describe("realtime appointment events", () => {
  let app: INestApplication
  let server: Server
  let prisma: PrismaService
  let redis: Redis
  let url: string
  let alpha: Clinic
  let beta: Clinic
  const sockets: Socket[] = []
  const alphaSlug = `rt-alpha-${Date.now()}`
  const betaSlug = `rt-beta-${Date.now()}`

  const clearThrottleState = async () => {
    const keys = await redis.keys(THROTTLER_KEY_PATTERN)
    if (keys.length > 0) await redis.del(...keys)
  }

  const provision = async (slug: string, email: string): Promise<Clinic> => {
    const signup = await request(server).post("/auth/signup").send({
      clinicName: `Realtime ${slug}`,
      slug,
      email,
      password: "s3cure-pass",
      name: "Realtime Owner"
    })
    expectStatus(signup, 200)
    const tenantId = signup.body.user.tenantId as string

    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId } })
    const service = await prisma.service.create({
      data: { tenantId, name: "Realtime Probe", durationMin: DURATION_MIN, bufferMin: 0 }
    })
    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: `dentist@${slug}.local`,
        passwordHash: "x",
        name: "Dr. Realtime",
        role: "dentist"
      }
    })
    const patient = await prisma.patient.create({
      data: {
        tenantId,
        name: "Sirinya Confidential",
        phone: `08${Date.now().toString().slice(-8)}`,
        email: "sirinya.confidential@example.com"
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
      patientId: patient.id,
      ownerToken: signup.body.accessToken as string
    }
  }

  const connect = (auth: Record<string, unknown>): Socket => {
    const socket = io(url, { auth, transports: ["websocket"], reconnection: false })
    sockets.push(socket)
    return socket
  }

  const subscribe = (socket: Socket, payload: Record<string, unknown>): Promise<SubscribeAck> =>
    new Promise((resolve, reject) => {
      socket.on("connect_error", reject)
      socket.emit(SUBSCRIBE, payload, resolve)
    })

  const listen = (socket: Socket): AppointmentChangedEvent[] => {
    const received: AppointmentChangedEvent[] = []
    socket.on(APPOINTMENT_CHANGED, (event: AppointmentChangedEvent) => received.push(event))
    return received
  }

  const book = (clinic: Clinic, startsAt: string) =>
    request(server)
      .post("/appointments")
      .set("Authorization", `Bearer ${clinic.ownerToken}`)
      .send({
        serviceId: clinic.serviceId,
        branchId: clinic.branchId,
        dentistId: clinic.dentistId,
        patientId: clinic.patientId,
        startsAt
      })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    prisma = app.get(PrismaService)
    redis = app.get<Redis>(REDIS)
    const address = server.address() as AddressInfo
    url = `http://127.0.0.1:${address.port}/${REALTIME_NAMESPACE}`
    await clearThrottleState()
    alpha = await provision(alphaSlug, "owner@rt-alpha.local")
    beta = await provision(betaSlug, "owner@rt-beta.local")
  })

  afterEach(() => {
    while (sockets.length > 0) sockets.pop()?.disconnect()
  })

  afterAll(async () => {
    await clearThrottleState()
    await prisma.tenant.deleteMany({ where: { slug: { in: [alphaSlug, betaSlug] } } })
    await app.close()
  })

  it("rejects a handshake with no token", async () => {
    const socket = connect({})
    const error = await new Promise<Error>((resolve, reject) => {
      socket.on("connect_error", resolve)
      socket.on("connect", () => reject(new Error("handshake was accepted without a token")))
    })
    expect(error.message).toBe("UNAUTHORIZED")
    expect(socket.connected).toBe(false)
  })

  it("rejects a handshake with a token this API did not sign", async () => {
    const socket = connect({ token: "not.a.jwt" })
    const error = await new Promise<Error>((resolve, reject) => {
      socket.on("connect_error", resolve)
      socket.on("connect", () => reject(new Error("handshake was accepted with a bogus token")))
    })
    expect(error.message).toBe("UNAUTHORIZED")
  })

  it("delivers appointment.changed to a subscribed client when a booking is created", async () => {
    const socket = connect({ token: alpha.ownerToken })
    const received = listen(socket)
    const ack = await subscribe(socket, { branchId: alpha.branchId })
    expect(ack.joined).toBe(branchRoom(alpha.tenantId, alpha.branchId))

    const booking = await book(alpha, utc(2))
    expectStatus(booking, 201)

    const event = await waitFor(() => received[0], "appointment.changed")
    expect(event.appointmentId).toBe(booking.body.id)
    expect(event.branchId).toBe(alpha.branchId)
    expect(event.action).toBe("created")
  })

  it("carries only invalidation data and never patient details", async () => {
    const socket = connect({ token: alpha.ownerToken })
    const received = listen(socket)
    await subscribe(socket, { branchId: alpha.branchId })

    const booking = await book(alpha, utc(3))
    expectStatus(booking, 201)

    const event = await waitFor(() => received[0], "appointment.changed")
    expect(Object.keys(event).sort()).toEqual(["action", "appointmentId", "branchId"])

    const serialised = JSON.stringify(event)
    expect(serialised).not.toContain("Sirinya")
    expect(serialised).not.toContain("Confidential")
    expect(serialised).not.toContain("sirinya.confidential@example.com")
    expect(serialised).not.toContain(alpha.patientId)
    expect(serialised).not.toContain("Dr. Realtime")
  })

  it("emits for reschedule and status changes too", async () => {
    const socket = connect({ token: alpha.ownerToken })
    const received = listen(socket)
    await subscribe(socket, { branchId: alpha.branchId })

    const booking = await book(alpha, utc(4))
    expectStatus(booking, 201)
    await waitFor(() => received[0], "created event")

    const moved = await request(server)
      .patch(`/appointments/${booking.body.id}`)
      .set("Authorization", `Bearer ${alpha.ownerToken}`)
      .send({ version: booking.body.version, startsAt: utc(5) })
    expectStatus(moved, 200)
    await waitFor(() => received[1], "rescheduled event")

    const cancelled = await request(server)
      .patch(`/appointments/${booking.body.id}/status`)
      .set("Authorization", `Bearer ${alpha.ownerToken}`)
      .send({ status: "cancelled" })
    expectStatus(cancelled, 200)
    await waitFor(() => received[2], "status event")

    expect(received.map((event) => event.action)).toEqual(["created", "rescheduled", "status"])
  })

  it("never delivers one tenant's events to another tenant's client", async () => {
    const alphaSocket = connect({ token: alpha.ownerToken })
    const betaSocket = connect({ token: beta.ownerToken })
    const alphaEvents = listen(alphaSocket)
    const betaEvents = listen(betaSocket)
    await subscribe(alphaSocket, { branchId: alpha.branchId })
    await subscribe(betaSocket, { branchId: beta.branchId })

    const booking = await book(beta, utc(6))
    expectStatus(booking, 201)

    await waitFor(() => betaEvents[0], "beta event")
    await settle()
    expect(alphaEvents).toHaveLength(0)
  })

  it("derives the room from the verified token, not from the client payload", async () => {
    const alphaSocket = connect({ token: alpha.ownerToken })
    const betaSocket = connect({ token: beta.ownerToken })
    const alphaEvents = listen(alphaSocket)
    const betaEvents = listen(betaSocket)

    const forged = await subscribe(alphaSocket, {
      tenantId: beta.tenantId,
      branchId: beta.branchId
    })
    expect(forged.joined).toBe(branchRoom(alpha.tenantId, beta.branchId))
    expect(forged.joined).not.toBe(branchRoom(beta.tenantId, beta.branchId))
    expect(forged.joined).not.toContain(beta.tenantId)

    await subscribe(betaSocket, { branchId: beta.branchId })

    const booking = await book(beta, utc(7))
    expectStatus(booking, 201)

    await waitFor(() => betaEvents[0], "beta event")
    await settle()
    expect(alphaEvents).toHaveLength(0)
  })
})
