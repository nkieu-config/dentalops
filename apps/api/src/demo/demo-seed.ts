import { AppointmentStatus, ClaimStatus, Prisma, PrismaClient } from "@prisma/client"
import * as argon2 from "argon2"
import { DEFAULT_OPENING_HOURS, DEFAULT_SERVICES } from "../tenant/defaults"

export const DEMO_SLUG = "demo-clinic"

let prisma: PrismaClient

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260801)

function randomInt(max: number) {
  return Math.floor(rand() * max)
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(items.length)] as T
}

const HEX = "0123456789abcdef"

function randomUuid() {
  let out = ""
  for (let i = 0; i < 32; i++) {
    if (i === 12) out += "4"
    else if (i === 16) out += HEX[(randomInt(16) & 0x3) | 0x8]
    else out += HEX[randomInt(16)]
    if (i === 7 || i === 11 || i === 15 || i === 19) out += "-"
  }
  return out
}

const FIRST_NAMES = [
  "Somsak",
  "Pim",
  "Nattapong",
  "Kanya",
  "Arthit",
  "Duangjai",
  "Chaiyo",
  "Waranya"
]

const SURNAMES = ["Chaiwat", "Wongsakorn", "Meesuk", "Tanakit", "Rojanaphan"]

const PATIENT_COUNT = 120
const SEED_WINDOW_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const GAPS_MIN = [0, 15, 30]

interface ShiftPattern {
  weekdays: number[]
  startHourUtc: number
  durationMin: number
}

const SHIFT_PATTERNS: ShiftPattern[] = [
  { weekdays: [1, 2, 3, 4, 5], startHourUtc: 2, durationMin: 480 },
  { weekdays: [1, 2, 3, 4, 5], startHourUtc: 2, durationMin: 480 },
  { weekdays: [2, 4], startHourUtc: 6, durationMin: 420 },
  { weekdays: [1, 3, 6], startHourUtc: 2, durationMin: 360 },
  { weekdays: [1, 2, 4, 5], startHourUtc: 6, durationMin: 420 },
  { weekdays: [2, 3, 5, 6], startHourUtc: 2, durationMin: 480 }
]

interface DayBatch {
  appointments: Prisma.AppointmentCreateManyInput[]
  claims: Prisma.ResourceClaimCreateManyInput[]
}

function isFree(busy: [number, number][], startsAt: number, endsAt: number) {
  return busy.every(([from, to]) => startsAt >= to || endsAt <= from)
}

export interface DemoSeedCounts {
  patients: number
  shifts: number
  appointments: number
}

export async function seedDemoTenant(client: PrismaClient): Promise<DemoSeedCounts> {
  prisma = client
  const now = new Date()

  await prisma.tenant.deleteMany({ where: { slug: DEMO_SLUG } })

  const tenant = await prisma.tenant.create({
    data: { slug: DEMO_SLUG, name: "ยิ้มสวย ทันตคลินิก" }
  })

  const sukhumvit = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Sukhumvit", openingHours: DEFAULT_OPENING_HOURS }
  })

  const ladprao = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Ladprao", openingHours: DEFAULT_OPENING_HOURS }
  })

  const xray = await prisma.equipmentType.create({
    data: { tenantId: tenant.id, name: "X-ray unit" }
  })

  const services = await Promise.all(
    DEFAULT_SERVICES.map((s) =>
      prisma.service.create({ data: { tenantId: tenant.id, bufferMin: 10, ...s } })
    )
  )

  const rootCanal = services.find((s) => s.name === "Root canal")
  if (rootCanal) {
    await prisma.serviceEquipmentRequirement.create({
      data: { tenantId: tenant.id, serviceId: rootCanal.id, equipmentTypeId: xray.id }
    })
  }

  const equipmentServiceIds = new Set(rootCanal ? [rootCanal.id] : [])
  const plainServices = services.filter((s) => !equipmentServiceIds.has(s.id))

  const branches = [sukhumvit, ladprao]
  const chairsByBranch = new Map<string, string[]>()
  const xrayByBranch = new Map<string, string>()

  for (const branch of branches) {
    const chairs: string[] = []
    for (const n of [1, 2, 3]) {
      const chair = await prisma.resource.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          type: "chair",
          name: `${branch.name} Chair ${n}`
        }
      })
      chairs.push(chair.id)
    }
    chairsByBranch.set(branch.id, chairs)
    const unit = await prisma.resource.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        equipmentTypeId: xray.id,
        type: "equipment",
        name: `${branch.name} X-ray`
      }
    })
    xrayByBranch.set(branch.id, unit.id)
  }

  const passwordHash = await argon2.hash("demo1234")

  const staff = [
    { email: "owner@demo-clinic.local", name: "Anong Prasert", role: "owner" as const },
    { email: "receptionist@demo-clinic.local", name: "Malee Suksan", role: "receptionist" as const },
    { email: "dentist1@demo-clinic.local", name: "Somchai Wattana", role: "dentist" as const },
    { email: "dentist2@demo-clinic.local", name: "Ploy Siriwan", role: "dentist" as const },
    { email: "dentist3@demo-clinic.local", name: "Nid Kanjana", role: "dentist" as const },
    { email: "dentist4@demo-clinic.local", name: "Kiat Thongchai", role: "dentist" as const },
    { email: "dentist5@demo-clinic.local", name: "Sunee Boonmee", role: "dentist" as const },
    { email: "dentist6@demo-clinic.local", name: "Teerapat Chuenjai", role: "dentist" as const }
  ]

  const dentistIds: string[] = []
  for (const person of staff) {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: person.email,
        passwordHash,
        name: person.name,
        role: person.role
      }
    })
    if (person.role === "dentist") dentistIds.push(user.id)
  }

  const patientRows: Prisma.PatientCreateManyInput[] = []
  for (let i = 0; i < PATIENT_COUNT; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]
    const last = SURNAMES[Math.floor(i / FIRST_NAMES.length) % SURNAMES.length]
    patientRows.push({
      id: randomUuid(),
      tenantId: tenant.id,
      name: `${first} ${last}`,
      phone: `0810000${String(i).padStart(3, "0")}`,
      email: `patient${i}@example.com`
    })
  }
  await prisma.patient.createMany({ data: patientRows })
  const patientIds = patientRows.map((p) => p.id as string)

  const shiftRows: Prisma.ShiftCreateManyInput[] = []
  const batches: DayBatch[] = []
  const xrayBusy = new Map<string, [number, number][]>()
  const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  for (let offset = -SEED_WINDOW_DAYS; offset <= SEED_WINDOW_DAYS; offset++) {
    const dayStart = midnightUtc + offset * DAY_MS
    const weekday = new Date(dayStart).getUTCDay()
    const batch: DayBatch = { appointments: [], claims: [] }

    for (const [dentistIndex, dentistId] of dentistIds.entries()) {
      const pattern = SHIFT_PATTERNS[dentistIndex]
      if (!pattern || !pattern.weekdays.includes(weekday)) continue

      const branch = branches[(offset + SEED_WINDOW_DAYS + dentistIndex) % branches.length]
      if (!branch) continue
      const chairs = chairsByBranch.get(branch.id)
      const xrayId = xrayByBranch.get(branch.id)
      if (!chairs || !xrayId) continue
      const chairId = chairs[dentistIndex % chairs.length] as string

      const shiftStart = dayStart + pattern.startHourUtc * 60 * MINUTE_MS
      const shiftEnd = shiftStart + pattern.durationMin * MINUTE_MS
      shiftRows.push({
        tenantId: tenant.id,
        staffId: dentistId,
        branchId: branch.id,
        startsAt: new Date(shiftStart),
        endsAt: new Date(shiftEnd)
      })

      const target = 2 + randomInt(4)
      let cursor = shiftStart
      for (let n = 0; n < target; n++) {
        let service = pick(services)
        let needsXray = equipmentServiceIds.has(service.id)
        const provisionalEnd = cursor + service.durationMin * MINUTE_MS
        const busy = xrayBusy.get(xrayId) ?? []
        if (needsXray && !isFree(busy, cursor, provisionalEnd)) {
          service = pick(plainServices)
          needsXray = false
        }

        const endsAt = cursor + service.durationMin * MINUTE_MS
        const chairEndsAt = endsAt + service.bufferMin * MINUTE_MS
        if (chairEndsAt > shiftEnd) break

        let status: AppointmentStatus = "confirmed"
        if (endsAt < now.getTime()) {
          const roll = rand()
          status = roll < 0.8 ? "completed" : roll < 0.9 ? "no_show" : "cancelled"
        }
        const claimStatus: ClaimStatus = status === "cancelled" ? "released" : "active"

        const appointmentId = randomUuid()
        batch.appointments.push({
          id: appointmentId,
          tenantId: tenant.id,
          branchId: branch.id,
          serviceId: service.id,
          dentistId,
          patientId: pick(patientIds),
          startsAt: new Date(cursor),
          endsAt: new Date(endsAt),
          status
        })
        batch.claims.push({
          tenantId: tenant.id,
          appointmentId,
          resourceId: chairId,
          startsAt: new Date(cursor),
          endsAt: new Date(chairEndsAt),
          status: claimStatus
        })
        if (needsXray) {
          batch.claims.push({
            tenantId: tenant.id,
            appointmentId,
            resourceId: xrayId,
            startsAt: new Date(cursor),
            endsAt: new Date(endsAt),
            status: claimStatus
          })
          if (claimStatus === "active") {
            busy.push([cursor, endsAt])
            xrayBusy.set(xrayId, busy)
          }
        }

        cursor = chairEndsAt + pick(GAPS_MIN) * MINUTE_MS
      }
    }

    if (batch.appointments.length > 0) batches.push(batch)
  }

  await prisma.shift.createMany({ data: shiftRows })

  const allAppointments = batches.flatMap((b) => b.appointments)
  const allClaims = batches.flatMap((b) => b.claims)

  let appointmentCount = 0
  try {
    await prisma.$transaction([
      prisma.appointment.createMany({ data: allAppointments }),
      prisma.resourceClaim.createMany({ data: allClaims })
    ])
    appointmentCount = allAppointments.length
  } catch {
    for (const batch of batches) {
      appointmentCount += await insertBatch(batch)
    }
  }

  console.log(`Seeded tenant ${tenant.slug} (${tenant.id})`)
  console.log(
    `patients=${patientRows.length} shifts=${shiftRows.length} appointments=${appointmentCount}`
  )

  return {
    patients: patientRows.length,
    shifts: shiftRows.length,
    appointments: appointmentCount
  }
}

async function insertBatch(batch: DayBatch) {
  try {
    await prisma.$transaction([
      prisma.appointment.createMany({ data: batch.appointments }),
      prisma.resourceClaim.createMany({ data: batch.claims })
    ])
    return batch.appointments.length
  } catch {
    return insertOneByOne(batch)
  }
}

async function insertOneByOne(batch: DayBatch) {
  let created = 0
  for (const appointment of batch.appointments) {
    const claims = batch.claims.filter((c) => c.appointmentId === appointment.id)
    try {
      await prisma.$transaction([
        prisma.appointment.createMany({ data: [appointment] }),
        prisma.resourceClaim.createMany({ data: claims })
      ])
      created++
    } catch {
      continue
    }
  }
  return created
}

