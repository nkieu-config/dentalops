import { AppointmentStatus, ClaimStatus, Prisma, PrismaClient } from "@prisma/client"
import { createHash } from "node:crypto"
import * as argon2 from "argon2"
import { DEFAULT_OPENING_HOURS, DEFAULT_SERVICES } from "../tenant/defaults"
import { AuditEntry, AuditService } from "../audit/audit.service"

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

function stableUuid(key: string): string {
  const bytes = createHash("sha1").update(`${DEMO_SLUG}:${key}`).digest().subarray(0, 16)
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80
  const hex = bytes.toString("hex")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function randomInt(max: number) {
  return Math.floor(rand() * max)
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(items.length)] as T
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  }
  return out
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
  "Waranya",
  "Kittipong",
  "Suda",
  "Preecha",
  "Malinee",
  "Narong",
  "Siriporn",
  "Wichai",
  "Panida",
  "Anuwat",
  "Sasithorn",
  "Boonsong",
  "Ratana",
  "Thanapon",
  "Wilai",
  "Sombat",
  "Chalermchai",
  "Apinya",
  "Weerachai",
  "Nuttida",
  "Somchit",
  "Pornthip",
  "Teerasak"
]

const SURNAMES = [
  "Chaiwat",
  "Wongsakorn",
  "Meesuk",
  "Tanakit",
  "Rojanaphan",
  "Srisawat",
  "Boonmee",
  "Charoensuk",
  "Phetchara",
  "Kittisak",
  "Ruangrit",
  "Sukjai",
  "Thongdee",
  "Wattanakul",
  "Prasertsuk",
  "Silapan",
  "Kanchanapan",
  "Chotirat",
  "Yodsuwan",
  "Intharat",
  "Saengchan",
  "Puangpaka",
  "Nakarin",
  "Bunyarit",
  "Sirikwan",
  "Techavanich",
  "Amornrat",
  "Pholsena",
  "Rattanaporn",
  "Kraisorn"
]

const PHONE_PREFIXES = [
  "061",
  "062",
  "063",
  "064",
  "065",
  "081",
  "082",
  "083",
  "084",
  "085",
  "086",
  "087",
  "088",
  "089",
  "090",
  "091",
  "092",
  "093",
  "094",
  "095",
  "096",
  "097",
  "098",
  "099"
]

const EMAIL_DOMAINS = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com"]

const PATIENT_NOTES = [
  "Allergic to penicillin",
  "Prefers morning appointments",
  "Gets anxious about needles, talk through each step",
  "Sensitive teeth, use extra anesthesia",
  "Wears a retainer, remove before cleaning",
  "Diabetic, monitor healing after extractions",
  "Pregnant, avoid X-ray unless necessary",
  "Grinds teeth at night, discussed a night guard",
  "Long-time patient, referred several family members",
  "Prefers the Sukhumvit branch",
  "Needs interpreter assistance for English",
  "Latex allergy, use nitrile gloves"
]

const NOTE_RATE = 0.2

function uniquePhone(used: Set<string>): string {
  let phone: string
  do {
    phone = `${pick(PHONE_PREFIXES)}${String(randomInt(10_000_000)).padStart(7, "0")}`
  } while (used.has(phone))
  used.add(phone)
  return phone
}

function emailFor(name: string, used: Set<string>): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .trim()
    .replace(/\s+/g, ".")
  let email = `${base}@${pick(EMAIL_DOMAINS)}`
  while (used.has(email)) {
    email = `${base}${randomInt(1000)}@${pick(EMAIL_DOMAINS)}`
  }
  used.add(email)
  return email
}

const LADPRAO_OPENING_HOURS = {
  mon: [["10:00", "19:00"]],
  tue: [["10:00", "19:00"]],
  wed: [["10:00", "19:00"]],
  thu: [["10:00", "19:00"]],
  fri: [["10:00", "19:00"]],
  sat: [["10:00", "15:00"]],
  sun: []
}

const CHAIR_COUNTS = [2, 4]
const BRANCH_INDEX_FOR_DENTIST = [1, 1, 1, 1, 0, 0]

export const PATIENT_COUNT = 800
const REGULAR_PATIENT_SHARE = 0.15
const REGULAR_VISIT_WEIGHT = 9
const EMAIL_SHARE = 0.68
const SEED_WINDOW_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const GAPS_MIN = [0, 0, 0, 0, 0, 0, 5, 10, 15, 30]
const SHIFT_START_OFFSETS_MIN = [0, 0, 0, 15]
const POST_LUNCH_OFFSETS_MIN = [0, 0, 10, 15, 20, 30]
const LUNCH_START_UTC_MIN = 5 * 60
const LUNCH_MINUTES = 60
const PUBLIC_BOOKING_DENTIST_INDEXES = new Set([0, 4])
const PUBLIC_BOOKING_GAP_MIN = 100

const SERVICE_WEIGHTS: Record<string, number> = {
  Cleaning: 46,
  Filling: 20,
  "Ortho adjustment": 12,
  Extraction: 9,
  "Root canal": 8,
  Whitening: 5
}

interface ShiftPattern {
  weekdays: number[]
  startHourUtc: number
  durationMin: number
}

const SHIFT_PATTERNS: ShiftPattern[] = [
  { weekdays: [1, 2, 3, 4, 5], startHourUtc: 2, durationMin: 480 },
  { weekdays: [1, 2, 3, 4, 5], startHourUtc: 2, durationMin: 480 },
  { weekdays: [1, 2, 3, 4, 5], startHourUtc: 3, durationMin: 480 },
  { weekdays: [1, 2, 3, 4, 5], startHourUtc: 4, durationMin: 480 },
  { weekdays: [1, 2, 4, 5], startHourUtc: 6, durationMin: 420 },
  { weekdays: [2, 3, 5, 6], startHourUtc: 2, durationMin: 480 }
]

type SeededRow<T, K extends keyof T> = Omit<T, K> & { [P in K]: Date }

type SeededAppointment = SeededRow<Prisma.AppointmentCreateManyInput, "startsAt" | "endsAt">
type SeededShift = SeededRow<Prisma.ShiftCreateManyInput, "startsAt" | "endsAt">
type SeededTimeBlock = SeededRow<Prisma.TimeBlockCreateManyInput, "startsAt" | "endsAt">

interface DayBatch {
  appointments: SeededAppointment[]
  claims: Prisma.ResourceClaimCreateManyInput[]
}

function isFree(busy: [number, number][], startsAt: number, endsAt: number) {
  return busy.every(([from, to]) => startsAt >= to || endsAt <= from)
}

function reserve(busyByOwner: Map<string, [number, number][]>, ownerId: string, startsAt: number, endsAt: number) {
  const busy = busyByOwner.get(ownerId) ?? []
  busy.push([startsAt, endsAt])
  busyByOwner.set(ownerId, busy)
}

function weightedPicker<T>(items: readonly T[], weightOf: (item: T) => number): () => T {
  const cumulative: number[] = []
  let total = 0
  for (const item of items) {
    total += Math.max(weightOf(item), 0)
    cumulative.push(total)
  }
  return () => {
    if (total <= 0) return pick(items)
    const roll = rand() * total
    const index = cumulative.findIndex((edge) => roll < edge)
    return items[index === -1 ? items.length - 1 : index] as T
  }
}

export interface DemoSeedCounts {
  patients: number
  shifts: number
  appointments: number
  appointmentSeries: number
  shiftSeries: number
}

const anchorTime = (): Date => {
  const pinned = process.env.DEMO_SEED_NOW
  if (!pinned) return new Date()
  const parsed = new Date(pinned)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`DEMO_SEED_NOW is not a date this runtime can parse: ${pinned}`)
  }
  return parsed
}

export async function seedDemoTenant(client: PrismaClient, audit?: AuditService): Promise<DemoSeedCounts> {
  prisma = client
  const now = anchorTime()

  await prisma.tenant.deleteMany({ where: { slug: DEMO_SLUG } })

  const tenant = await prisma.tenant.create({
    data: { slug: DEMO_SLUG, name: "Bright Smile Dental Clinic" }
  })

  const sukhumvit = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Sukhumvit", openingHours: DEFAULT_OPENING_HOURS }
  })

  const ladprao = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Ladprao", openingHours: LADPRAO_OPENING_HOURS }
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
  const serviceWeight = (service: { name: string }) => SERVICE_WEIGHTS[service.name] ?? 1
  const pickService = weightedPicker(services, serviceWeight)
  const pickPlainService = weightedPicker(plainServices, serviceWeight)

  const branches = [sukhumvit, ladprao]
  const chairsByBranch = new Map<string, string[]>()
  const xrayByBranch = new Map<string, string>()

  for (const [branchIndex, branch] of branches.entries()) {
    const chairCount = CHAIR_COUNTS[branchIndex] ?? 3
    const chairs: string[] = []
    for (let n = 1; n <= chairCount; n++) {
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

  // A retired chair, never wired into chairsByBranch, so it never receives a booking.
  await prisma.resource.create({
    data: {
      tenantId: tenant.id,
      branchId: ladprao.id,
      type: "chair",
      name: `Ladprao Chair ${(CHAIR_COUNTS[1] ?? 2) + 1} (out of service)`,
      isActive: false
    }
  })

  const passwordHash = await argon2.hash("demo1234")

  const staffPeople = [
    { email: "owner@demo-clinic.local", name: "Anong Prasert", role: "owner" as const },
    { email: "receptionist@demo-clinic.local", name: "Malee Suksan", role: "receptionist" as const },
    { email: "dentist1@demo-clinic.local", name: "Somchai Wattana", role: "dentist" as const },
    { email: "dentist2@demo-clinic.local", name: "Ploy Siriwan", role: "dentist" as const },
    { email: "dentist3@demo-clinic.local", name: "Nid Kanjana", role: "dentist" as const },
    { email: "dentist4@demo-clinic.local", name: "Kiat Thongchai", role: "dentist" as const },
    { email: "dentist5@demo-clinic.local", name: "Sunee Boonmee", role: "dentist" as const },
    { email: "dentist6@demo-clinic.local", name: "Teerapat Chuenjai", role: "dentist" as const },
    {
      email: "dentist7@demo-clinic.local",
      name: "Preecha Sombat",
      role: "dentist" as const,
      isActive: false
    }
  ]

  const dentistIds: string[] = []
  const staffActors = new Map<string, AuditEntry["actor"]>()
  let ownerId = ""
  let receptionistId = ""

  for (const person of staffPeople) {
    const isActive = "isActive" in person ? (person.isActive ?? true) : true
    const user = await prisma.user.create({
      data: {
        id: stableUuid(person.email),
        tenantId: tenant.id,
        email: person.email,
        passwordHash,
        name: person.name,
        role: person.role,
        isActive
      }
    })
    staffActors.set(user.id, { type: "staff", id: user.id, name: person.name })
    if (person.role === "dentist" && isActive) dentistIds.push(user.id)
    if (person.role === "owner") ownerId = user.id
    if (person.role === "receptionist") receptionistId = user.id
  }

  const ownerActor = staffActors.get(ownerId) as AuditEntry["actor"]
  const receptionistActor = staffActors.get(receptionistId) as AuditEntry["actor"]
  const dentistActors = dentistIds.map((id) => staffActors.get(id) as AuditEntry["actor"])
  const guestActor = (): AuditEntry["actor"] => ({
    type: "public",
    id: `guest-${1000 + randomInt(9000)}`,
    name: "Guest"
  })

  const usedPhones = new Set<string>()
  const usedEmails = new Set<string>()
  const namePairs = shuffled(FIRST_NAMES.flatMap((first) => SURNAMES.map((last) => [first, last] as const)))

  const patientRows: Prisma.PatientCreateManyInput[] = []
  for (let i = 0; i < PATIENT_COUNT; i++) {
    const [first, last] = namePairs[i] ?? [pick(FIRST_NAMES), pick(SURNAMES)]
    const name = `${first} ${last}`
    patientRows.push({
      id: randomUuid(),
      tenantId: tenant.id,
      name,
      phone: uniquePhone(usedPhones),
      email: rand() < EMAIL_SHARE ? emailFor(name, usedEmails) : "",
      notes: rand() < NOTE_RATE ? pick(PATIENT_NOTES) : undefined
    })
  }
  await prisma.patient.createMany({ data: patientRows })
  const patientIds = patientRows.map((p) => p.id as string)

  const regularCount = Math.max(1, Math.round(PATIENT_COUNT * REGULAR_PATIENT_SHARE))
  const regularIds = new Set(patientIds.slice(0, regularCount))
  const pickPatientId = weightedPicker(patientIds, (id) => (regularIds.has(id) ? REGULAR_VISIT_WEIGHT : 1))
  const patientBusy = new Map<string, [number, number][]>()

  const pickFreePatientId = (startsAt: number, endsAt: number): string | undefined => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = pickPatientId()
      if (isFree(patientBusy.get(candidate) ?? [], startsAt, endsAt)) return candidate
    }
    return patientIds.find((id) => isFree(patientBusy.get(id) ?? [], startsAt, endsAt))
  }

  const shiftRows: SeededShift[] = []
  const batches: DayBatch[] = []
  const xrayBusy = new Map<string, [number, number][]>()
  const midnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  const branchForDentist = (dentistIndex: number) => branches[BRANCH_INDEX_FOR_DENTIST[dentistIndex] ?? 0]

  const seriesByDentist = new Map<string, string>()
  const branchPosition = new Map<string, number>()
  const chairIdForDentist = new Map<string, string>()

  for (const [dentistIndex, dentistId] of dentistIds.entries()) {
    const pattern = SHIFT_PATTERNS[dentistIndex]
    if (!pattern) continue
    const branch = branchForDentist(dentistIndex)
    if (!branch) continue
    const series = await prisma.shiftSeries.create({
      data: {
        tenantId: tenant.id,
        staffId: dentistId,
        branchId: branch.id,
        freq: "weekly",
        interval: 1,
        byWeekday: pattern.weekdays,
        timeStart: `${String(pattern.startHourUtc).padStart(2, "0")}:00`,
        durationMin: pattern.durationMin,
        startsOn: new Date(midnightUtc - SEED_WINDOW_DAYS * DAY_MS)
      }
    })
    seriesByDentist.set(dentistId, series.id)

    const chairs = chairsByBranch.get(branch.id)
    if (chairs && chairs.length > 0) {
      const pos = branchPosition.get(branch.id) ?? 0
      branchPosition.set(branch.id, pos + 1)
      const chairId = chairs[pos % chairs.length]
      if (chairId) chairIdForDentist.set(dentistId, chairId)
    }
  }

  const orthoService = services.find((s) => s.name === "Ortho adjustment")
  const orthoDentistId = dentistIds[0]
  const orthoPatientId = patientIds[0]
  const ORTHO_WEEKDAY = 3
  const orthoSeries =
    orthoService && orthoDentistId && orthoPatientId
      ? await prisma.appointmentSeries.create({
          data: {
            tenantId: tenant.id,
            freq: "weekly",
            interval: 1,
            byWeekday: [ORTHO_WEEKDAY],
            count: 0
          }
        })
      : null
  let orthoCount = 0

  const cleaningService = services.find((s) => s.name === "Cleaning")
  const secondSeriesDentistId = dentistIds[2]
  const secondSeriesPatientId = patientIds[1]
  const SECOND_SERIES_WEEKDAY = 4
  const secondSeries =
    cleaningService && secondSeriesDentistId && secondSeriesPatientId
      ? await prisma.appointmentSeries.create({
          data: {
            tenantId: tenant.id,
            freq: "weekly",
            interval: 1,
            byWeekday: [SECOND_SERIES_WEEKDAY],
            count: 0
          }
        })
      : null
  let secondSeriesCount = 0

  const violationDentistId = dentistIds[4]
  let violationInjected = false

  for (let offset = -SEED_WINDOW_DAYS; offset <= SEED_WINDOW_DAYS; offset++) {
    const dayStart = midnightUtc + offset * DAY_MS
    const weekday = new Date(dayStart).getUTCDay()
    const batch: DayBatch = { appointments: [], claims: [] }

    for (const [dentistIndex, dentistId] of dentistIds.entries()) {
      const pattern = SHIFT_PATTERNS[dentistIndex]
      if (!pattern || !pattern.weekdays.includes(weekday)) continue

      const branch = branchForDentist(dentistIndex)
      if (!branch) continue
      const chairId = chairIdForDentist.get(dentistId)
      const xrayId = xrayByBranch.get(branch.id)
      if (!chairId || !xrayId) continue

      const shiftStart = dayStart + pattern.startHourUtc * 60 * MINUTE_MS
      const shiftEnd = shiftStart + pattern.durationMin * MINUTE_MS
      const bookingEnd = PUBLIC_BOOKING_DENTIST_INDEXES.has(dentistIndex)
        ? shiftEnd - PUBLIC_BOOKING_GAP_MIN * MINUTE_MS
        : shiftEnd
      shiftRows.push({
        id: randomUuid(),
        tenantId: tenant.id,
        staffId: dentistId,
        branchId: branch.id,
        seriesId: seriesByDentist.get(dentistId),
        startsAt: new Date(shiftStart),
        endsAt: new Date(shiftEnd)
      })

      // High enough that the loop below is always stopped by shiftEnd, not by this count —
      // shifts fill to capacity so the demo reads as a genuinely busy clinic.
      const target = 16
      const lunchStart = dayStart + LUNCH_START_UTC_MIN * MINUTE_MS
      const lunchEnd = lunchStart + LUNCH_MINUTES * MINUTE_MS
      let cursor = shiftStart

      if (
        orthoSeries &&
        orthoService &&
        orthoPatientId &&
        dentistId === orthoDentistId &&
        weekday === ORTHO_WEEKDAY
      ) {
        const orthoEnd = cursor + orthoService.durationMin * MINUTE_MS
        const orthoChairEnd = orthoEnd + orthoService.bufferMin * MINUTE_MS
        const orthoId = randomUuid()
        const orthoStatus: AppointmentStatus = orthoEnd < now.getTime() ? "completed" : "confirmed"
        batch.appointments.push({
          id: orthoId,
          tenantId: tenant.id,
          branchId: branch.id,
          seriesId: orthoSeries.id,
          serviceId: orthoService.id,
          dentistId,
          patientId: orthoPatientId,
          startsAt: new Date(cursor),
          endsAt: new Date(orthoEnd),
          status: orthoStatus
        })
        batch.claims.push({
          tenantId: tenant.id,
          appointmentId: orthoId,
          resourceId: chairId,
          startsAt: new Date(cursor),
          endsAt: new Date(orthoChairEnd),
          status: "active"
        })
        reserve(patientBusy, orthoPatientId, cursor, orthoEnd)
        orthoCount++
        cursor = orthoChairEnd
      }

      if (
        secondSeries &&
        cleaningService &&
        secondSeriesPatientId &&
        dentistId === secondSeriesDentistId &&
        weekday === SECOND_SERIES_WEEKDAY
      ) {
        const cleaningEnd = cursor + cleaningService.durationMin * MINUTE_MS
        const cleaningChairEnd = cleaningEnd + cleaningService.bufferMin * MINUTE_MS
        const cleaningId = randomUuid()
        const cleaningStatus: AppointmentStatus = cleaningEnd < now.getTime() ? "completed" : "confirmed"
        batch.appointments.push({
          id: cleaningId,
          tenantId: tenant.id,
          branchId: branch.id,
          seriesId: secondSeries.id,
          serviceId: cleaningService.id,
          dentistId,
          patientId: secondSeriesPatientId,
          startsAt: new Date(cursor),
          endsAt: new Date(cleaningEnd),
          status: cleaningStatus
        })
        batch.claims.push({
          tenantId: tenant.id,
          appointmentId: cleaningId,
          resourceId: chairId,
          startsAt: new Date(cursor),
          endsAt: new Date(cleaningChairEnd),
          status: "active"
        })
        reserve(patientBusy, secondSeriesPatientId, cursor, cleaningEnd)
        secondSeriesCount++
        cursor = cleaningChairEnd
      }

      if (cursor === shiftStart) cursor += pick(SHIFT_START_OFFSETS_MIN) * MINUTE_MS

      for (let n = 0; n < target; n++) {
        let service = pickService()
        let needsXray = equipmentServiceIds.has(service.id)
        const provisionalEnd = cursor + service.durationMin * MINUTE_MS
        const busy = xrayBusy.get(xrayId) ?? []
        if (needsXray && !isFree(busy, cursor, provisionalEnd)) {
          service = pickPlainService()
          needsXray = false
        }

        let endsAt = cursor + service.durationMin * MINUTE_MS
        if (cursor < lunchStart && endsAt > lunchStart) {
          const fitsBeforeLunch = plainServices.filter(
            (candidate) => cursor + candidate.durationMin * MINUTE_MS <= lunchStart
          )
          if (fitsBeforeLunch.length > 0) {
            service = weightedPicker(fitsBeforeLunch, serviceWeight)()
            needsXray = false
          } else {
            cursor = lunchEnd + pick(POST_LUNCH_OFFSETS_MIN) * MINUTE_MS
          }
          endsAt = cursor + service.durationMin * MINUTE_MS
        } else if (cursor >= lunchStart && cursor < lunchEnd) {
          cursor = lunchEnd + pick(POST_LUNCH_OFFSETS_MIN) * MINUTE_MS
          endsAt = cursor + service.durationMin * MINUTE_MS
        }
        const chairEndsAt = endsAt + service.bufferMin * MINUTE_MS
        if (chairEndsAt > bookingEnd) break

        const patientId = pickFreePatientId(cursor, endsAt)
        if (!patientId) break

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
          patientId,
          startsAt: new Date(cursor),
          endsAt: new Date(endsAt),
          status
        })
        if (status !== "cancelled") reserve(patientBusy, patientId, cursor, endsAt)
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

      // Deliberately plant one roster violation near "now" so the roster page's own
      // validation isn't a permanently clean, unexercised feature in the demo: a shift
      // that leaves too little rest before the regular one, and a confirmed appointment
      // booked outside any rostered shift.
      if (!violationInjected && dentistId === violationDentistId && offset >= 0) {
        const restStart = shiftStart - 180 * MINUTE_MS
        const restEnd = shiftStart - 60 * MINUTE_MS
        const outsideService = pickPlainService()
        const outsideStart = shiftEnd + 30 * MINUTE_MS
        const outsideEnd = outsideStart + outsideService.durationMin * MINUTE_MS
        const outsideChairEnd = outsideEnd + outsideService.bufferMin * MINUTE_MS
        const outsidePatientId = pickFreePatientId(outsideStart, outsideEnd)

        if (outsideStart > now.getTime() && outsidePatientId) {
          violationInjected = true
          shiftRows.push({
            id: randomUuid(),
            tenantId: tenant.id,
            staffId: dentistId,
            branchId: branch.id,
            startsAt: new Date(restStart),
            endsAt: new Date(restEnd)
          })
          const outsideId = randomUuid()
          batch.appointments.push({
            id: outsideId,
            tenantId: tenant.id,
            branchId: branch.id,
            serviceId: outsideService.id,
            dentistId,
            patientId: outsidePatientId,
            startsAt: new Date(outsideStart),
            endsAt: new Date(outsideEnd),
            status: "confirmed"
          })
          reserve(patientBusy, outsidePatientId, outsideStart, outsideEnd)
          batch.claims.push({
            tenantId: tenant.id,
            appointmentId: outsideId,
            resourceId: chairId,
            startsAt: new Date(outsideStart),
            endsAt: new Date(outsideChairEnd),
            status: "active"
          })
        }
      }
    }

    if (batch.appointments.length > 0) batches.push(batch)
  }

  if (orthoSeries) {
    await prisma.appointmentSeries.update({
      where: { id: orthoSeries.id },
      data: { count: orthoCount }
    })
  }
  if (secondSeries) {
    await prisma.appointmentSeries.update({
      where: { id: secondSeries.id },
      data: { count: secondSeriesCount }
    })
  }

  // Detach one occurrence of the second series from its pattern: it ran long that day,
  // so its own time no longer matches the series definition. Shifting the appointment's
  // own end time earlier could collide with whatever was booked right after it, so we
  // only ever shrink it — never extend — to stay clear of the no-double-booking constraint.
  const secondSeriesAppointments = batches
    .flatMap((b) => b.appointments)
    .filter((a) => a.seriesId === secondSeries?.id && a.startsAt.getTime() < now.getTime())
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
  const detachedAppointment = secondSeriesAppointments[0]
  if (detachedAppointment) {
    detachedAppointment.detached = true
    detachedAppointment.endsAt = new Date(detachedAppointment.endsAt.getTime() - 10 * MINUTE_MS)
  }

  // Detach one ordinary shift the same way: extend it later, which can never collide with
  // the next day's shift given the multi-hour rest every pattern here already leaves.
  const detachCandidateDentistId = dentistIds[2]
  const detachableShifts = shiftRows
    .filter(
      (s) =>
        s.staffId === detachCandidateDentistId &&
        s.seriesId !== undefined &&
        s.startsAt.getTime() < now.getTime()
    )
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
  const detachedShift = detachableShifts[0]
  if (detachedShift) {
    detachedShift.detached = true
    detachedShift.endsAt = new Date(detachedShift.endsAt.getTime() + 60 * MINUTE_MS)
  }

  const timeBlockRows: SeededTimeBlock[] = [
    {
      id: randomUuid(),
      tenantId: tenant.id,
      branchId: sukhumvit.id,
      reason: "Deep cleaning - clinic closed at lunch",
      startsAt: new Date(midnightUtc + 2 * DAY_MS + 5 * 60 * MINUTE_MS),
      endsAt: new Date(midnightUtc + 2 * DAY_MS + 6 * 60 * MINUTE_MS)
    },
    {
      id: randomUuid(),
      tenantId: tenant.id,
      staffId: dentistIds[1],
      reason: "Continuing education course",
      startsAt: new Date(midnightUtc - 3 * DAY_MS + 2 * 60 * MINUTE_MS),
      endsAt: new Date(midnightUtc - 3 * DAY_MS + 9 * 60 * MINUTE_MS)
    },
    {
      id: randomUuid(),
      tenantId: tenant.id,
      branchId: ladprao.id,
      reason: "Air-conditioning maintenance",
      startsAt: new Date(midnightUtc + 10 * DAY_MS + 2 * 60 * MINUTE_MS),
      endsAt: new Date(midnightUtc + 10 * DAY_MS + 4 * 60 * MINUTE_MS)
    }
  ]

  await prisma.shift.createMany({ data: shiftRows })
  await prisma.timeBlock.createMany({ data: timeBlockRows })

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

  await backfillAuditLog(audit, {
    tenantId: tenant.id,
    now,
    midnightUtc,
    patientRows,
    shiftRows,
    allAppointments,
    timeBlockRows,
    seriesByDentist,
    orthoSeries,
    secondSeries,
    detachedAppointment,
    detachedShift,
    ownerActor,
    receptionistActor,
    dentistActors,
    guestActor
  })

  console.log(`Seeded tenant ${tenant.slug} (${tenant.id})`)
  console.log(
    `patients=${patientRows.length} shifts=${shiftRows.length} appointments=${appointmentCount}`
  )

  return {
    patients: patientRows.length,
    shifts: shiftRows.length,
    appointments: appointmentCount,
    appointmentSeries: (orthoSeries ? 1 : 0) + (secondSeries ? 1 : 0),
    shiftSeries: seriesByDentist.size
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

interface BackfillInput {
  tenantId: string
  now: Date
  midnightUtc: number
  patientRows: Prisma.PatientCreateManyInput[]
  shiftRows: SeededShift[]
  allAppointments: SeededAppointment[]
  timeBlockRows: SeededTimeBlock[]
  seriesByDentist: Map<string, string>
  orthoSeries: { id: string } | null
  secondSeries: { id: string } | null
  detachedAppointment: SeededAppointment | undefined
  detachedShift: SeededShift | undefined
  ownerActor: AuditEntry["actor"]
  receptionistActor: AuditEntry["actor"]
  dentistActors: AuditEntry["actor"][]
  guestActor: () => AuditEntry["actor"]
}

// The demo tenant is seeded straight through Prisma, bypassing the HTTP layer entirely —
// which means AuditInterceptor never fires and the Activity page would otherwise show
// "Nothing has happened yet" forever. This reconstructs a plausible audit trail directly
// in Mongo so the page anyone lands on via "Explore the demo" has something real to filter.
async function backfillAuditLog(audit: AuditService | undefined, input: BackfillInput): Promise<void> {
  if (!audit) return

  const {
    tenantId,
    now,
    midnightUtc,
    patientRows,
    shiftRows,
    allAppointments,
    timeBlockRows,
    seriesByDentist,
    orthoSeries,
    secondSeries,
    detachedAppointment,
    detachedShift,
    ownerActor,
    receptionistActor,
    dentistActors,
    guestActor
  } = input

  const entries: AuditEntry[] = []
  const clampToNow = (at: number): Date => {
    if (at <= now.getTime()) return new Date(at)
    const overflowDays = Math.min(SEED_WINDOW_DAYS, Math.ceil((at - now.getTime()) / DAY_MS) + 1)
    return new Date(now.getTime() - randomInt(overflowDays * DAY_MS))
  }
  const push = (entry: Omit<AuditEntry, "tenantId" | "requestId">) => {
    entries.push({ tenantId, requestId: randomUuid(), ...entry })
  }

  for (const patient of patientRows) {
    push({
      actor: rand() < 0.85 ? receptionistActor : ownerActor,
      action: "POST /patients",
      entity: { type: "patients", id: patient.id as string },
      after: { id: patient.id, name: patient.name },
      at: clampToNow(now.getTime() - randomInt(SEED_WINDOW_DAYS * 2) * DAY_MS - randomInt(1440) * MINUTE_MS)
    })
  }

  const seriesStart = new Date(midnightUtc - SEED_WINDOW_DAYS * DAY_MS)
  for (const [dentistId, seriesId] of seriesByDentist.entries()) {
    push({
      actor: ownerActor,
      action: "POST /shifts/series",
      entity: { type: "shift-series", id: seriesId },
      after: { id: seriesId, staffId: dentistId },
      at: seriesStart
    })
  }

  for (const series of [orthoSeries, secondSeries]) {
    if (!series) continue
    push({
      actor: receptionistActor,
      action: "POST /appointments/series",
      entity: { type: "series", id: series.id },
      after: { id: series.id },
      at: seriesStart
    })
  }

  for (const appt of allAppointments) {
    const startsAtMs = appt.startsAt.getTime()
    if (!appt.seriesId) {
      const roll = rand()
      const actor = roll < 0.65 ? receptionistActor : roll < 0.85 ? pick(dentistActors) : guestActor()
      const isPublic = roll >= 0.85
      push({
        actor,
        action: isPublic ? "POST /public/:clinicSlug/appointments" : "POST /appointments",
        entity: { type: isPublic ? "public" : "appointments", id: appt.id as string },
        after: {
          id: appt.id,
          branchId: appt.branchId,
          serviceId: appt.serviceId,
          dentistId: appt.dentistId,
          patientId: appt.patientId,
          startsAt: appt.startsAt.toISOString(),
          status: "confirmed"
        },
        at: clampToNow(startsAtMs - ((1 + randomInt(13)) * DAY_MS + randomInt(720) * MINUTE_MS))
      })
    }

    if (appt.status && appt.status !== "confirmed") {
      const endsAtMs = appt.endsAt.getTime()
      push({
        actor: appt.status === "completed" ? pick(dentistActors) : receptionistActor,
        action: "appointment.status",
        entity: { type: "appointment", id: appt.id as string },
        before: { status: "confirmed" },
        after: { status: appt.status },
        at: clampToNow(endsAtMs + randomInt(30) * MINUTE_MS)
      })
    }
  }

  if (detachedAppointment) {
    push({
      actor: receptionistActor,
      action: "PATCH /appointments/:id",
      entity: { type: "appointments", id: detachedAppointment.id as string },
      after: {
        id: detachedAppointment.id,
        branchId: detachedAppointment.branchId,
        startsAt: detachedAppointment.startsAt.toISOString()
      },
      at: clampToNow(detachedAppointment.startsAt.getTime() - randomInt(120) * MINUTE_MS)
    })
  }

  if (detachedShift) {
    push({
      actor: ownerActor,
      action: "PATCH /shifts/:id",
      entity: { type: "shifts", id: detachedShift.id as string },
      after: {
        id: detachedShift.id,
        branchId: detachedShift.branchId,
        startsAt: detachedShift.startsAt.toISOString()
      },
      at: clampToNow(detachedShift.startsAt.getTime() - randomInt(120) * MINUTE_MS)
    })
  }

  const standaloneShifts = shiftRows.filter((s) => s.seriesId === undefined && s.id !== detachedShift?.id)
  for (const shift of standaloneShifts) {
    push({
      actor: ownerActor,
      action: "POST /shifts",
      entity: { type: "shifts", id: shift.id as string },
      after: {
        id: shift.id,
        branchId: shift.branchId,
        startsAt: shift.startsAt.toISOString()
      },
      at: clampToNow(shift.startsAt.getTime() - randomInt(4320) * MINUTE_MS)
    })
  }

  for (const block of timeBlockRows) {
    push({
      actor: ownerActor,
      action: "POST /time-blocks",
      entity: { type: "time-blocks", id: block.id as string },
      after: {
        id: block.id,
        branchId: block.branchId ?? undefined,
        startsAt: block.startsAt.toISOString()
      },
      at: clampToNow(block.startsAt.getTime() - randomInt(2880) * MINUTE_MS)
    })
  }

  // audit-logs pages by _id (insertion order), which only reads as "most recent first"
  // if documents are inserted in the same order their `at` actually happened.
  entries.sort((a, b) => a.at.getTime() - b.at.getTime())
  await audit.recordMany(entries)
}
