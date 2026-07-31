import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const at = (h: number, m = 0) => new Date(Date.UTC(2026, 7, 4, h, m, 0))

describe("appointment and resource exclusion constraints", () => {
  let tenantId: string
  let branchId: string
  let serviceId: string
  let dentistId: string
  let patientId: string
  let chairId: string

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: `appt-${Date.now()}`, name: "Appointment Test Clinic" }
    })
    tenantId = tenant.id

    const branch = await prisma.branch.create({
      data: { tenantId, name: "Main", openingHours: {} }
    })
    branchId = branch.id

    const service = await prisma.service.create({
      data: { tenantId, name: "Cleaning", durationMin: 60 }
    })
    serviceId = service.id

    const dentist = await prisma.user.create({
      data: {
        tenantId,
        email: "dentist2@example.com",
        passwordHash: "x",
        name: "Dr. Somchai",
        role: "dentist"
      }
    })
    dentistId = dentist.id

    const patient = await prisma.patient.create({
      data: { tenantId, name: "Somsak C.", phone: "0812345678", email: "s@example.com" }
    })
    patientId = patient.id

    const chair = await prisma.resource.create({
      data: { tenantId, branchId, type: "chair", name: "Chair 1" }
    })
    chairId = chair.id
  })

  afterAll(async () => {
    await prisma.tenant.delete({ where: { id: tenantId } })
    await prisma.$disconnect()
  })

  const makeAppointment = (startHour: number, endHour: number) =>
    prisma.appointment.create({
      data: {
        tenantId,
        branchId,
        serviceId,
        dentistId,
        patientId,
        startsAt: at(startHour),
        endsAt: at(endHour)
      }
    })

  it("rejects a second confirmed appointment overlapping the same dentist", async () => {
    await makeAppointment(9, 10)
    await expect(makeAppointment(9, 11)).rejects.toThrow()
  })

  it("allows the overlapping slot once the blocking appointment is cancelled", async () => {
    const blocking = await makeAppointment(13, 14)
    await expect(makeAppointment(13, 14)).rejects.toThrow()

    await prisma.appointment.update({
      where: { id: blocking.id },
      data: { status: "cancelled" }
    })

    const replacement = await makeAppointment(13, 14)
    expect(replacement.status).toBe("confirmed")
  })

  it("rejects a second active claim on the same resource", async () => {
    const first = await makeAppointment(15, 16)
    await prisma.resourceClaim.create({
      data: {
        tenantId,
        appointmentId: first.id,
        resourceId: chairId,
        startsAt: at(15),
        endsAt: at(16)
      }
    })

    const otherDentist = await prisma.user.create({
      data: {
        tenantId,
        email: "dentist3@example.com",
        passwordHash: "x",
        name: "Dr. Ploy",
        role: "dentist"
      }
    })

    const second = await prisma.appointment.create({
      data: {
        tenantId,
        branchId,
        serviceId,
        dentistId: otherDentist.id,
        patientId,
        startsAt: at(15, 30),
        endsAt: at(16, 30)
      }
    })

    await expect(
      prisma.resourceClaim.create({
        data: {
          tenantId,
          appointmentId: second.id,
          resourceId: chairId,
          startsAt: at(15, 30),
          endsAt: at(16, 30)
        }
      })
    ).rejects.toThrow()
  })
})
