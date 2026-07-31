import { PrismaClient } from "@prisma/client"
import * as argon2 from "argon2"
import { DEFAULT_OPENING_HOURS, DEFAULT_SERVICES } from "../src/tenant/defaults"

const prisma = new PrismaClient()

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: "demo-clinic" } })

  const tenant = await prisma.tenant.create({
    data: { slug: "demo-clinic", name: "ยิ้มสวย ทันตคลินิก" }
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

  for (const branch of [sukhumvit, ladprao]) {
    for (const n of [1, 2, 3]) {
      await prisma.resource.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          type: "chair",
          name: `${branch.name} Chair ${n}`
        }
      })
    }
    await prisma.resource.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        equipmentTypeId: xray.id,
        type: "equipment",
        name: `${branch.name} X-ray`
      }
    })
  }

  const passwordHash = await argon2.hash("demo1234")

  const staff = [
    { email: "owner@demo-clinic.local", name: "Anong Prasert", role: "owner" as const },
    { email: "receptionist@demo-clinic.local", name: "Malee Suksan", role: "receptionist" as const },
    { email: "dentist1@demo-clinic.local", name: "Somchai Wattana", role: "dentist" as const },
    { email: "dentist2@demo-clinic.local", name: "Ploy Siriwan", role: "dentist" as const },
    { email: "dentist3@demo-clinic.local", name: "Nid Kanjana", role: "dentist" as const },
    { email: "dentist4@demo-clinic.local", name: "Kiat Thongchai", role: "dentist" as const }
  ]

  for (const person of staff) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: person.email,
        passwordHash,
        name: person.name,
        role: person.role
      }
    })
  }

  const patients = [
    { name: "Somsak Chaiwat", phone: "0811111111" },
    { name: "Pim Wongsakorn", phone: "0822222222" },
    { name: "Nattapong Meesuk", phone: "0833333333" },
    { name: "Kanya Tanakit", phone: "0844444444" }
  ]

  for (const [i, p] of patients.entries()) {
    await prisma.patient.create({
      data: {
        tenantId: tenant.id,
        name: p.name,
        phone: p.phone,
        email: `patient${i}@example.com`
      }
    })
  }

  console.log(`Seeded tenant ${tenant.slug} (${tenant.id})`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
