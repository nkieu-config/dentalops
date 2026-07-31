import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const OPENING_HOURS = {
  mon: [["09:00", "20:00"]],
  tue: [["09:00", "20:00"]],
  wed: [["09:00", "20:00"]],
  thu: [["09:00", "20:00"]],
  fri: [["09:00", "20:00"]],
  sat: [["09:00", "17:00"]],
  sun: []
}

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: "demo-clinic" } })

  const tenant = await prisma.tenant.create({
    data: { slug: "demo-clinic", name: "ยิ้มสวย ทันตคลินิก" }
  })

  const sukhumvit = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Sukhumvit", openingHours: OPENING_HOURS }
  })

  const ladprao = await prisma.branch.create({
    data: { tenantId: tenant.id, name: "Ladprao", openingHours: OPENING_HOURS }
  })

  const xray = await prisma.equipmentType.create({
    data: { tenantId: tenant.id, name: "X-ray unit" }
  })

  const services = await Promise.all(
    [
      { name: "Cleaning", durationMin: 45, colorIndex: 0 },
      { name: "Filling", durationMin: 60, colorIndex: 1 },
      { name: "Root canal", durationMin: 90, colorIndex: 2 },
      { name: "Ortho adjustment", durationMin: 30, colorIndex: 3 },
      { name: "Extraction", durationMin: 60, colorIndex: 4 },
      { name: "Whitening", durationMin: 75, colorIndex: 5 }
    ].map((s) =>
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

  const staff = [
    { name: "Anong Prasert", role: "owner" as const },
    { name: "Somchai Wattana", role: "dentist" as const },
    { name: "Ploy Siriwan", role: "dentist" as const },
    { name: "Nid Kanjana", role: "dentist" as const },
    { name: "Kiat Thongchai", role: "dentist" as const },
    { name: "Malee Suksan", role: "receptionist" as const }
  ]

  for (const [i, person] of staff.entries()) {
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `${person.role}${i}@demo-clinic.local`,
        passwordHash: "seeded-placeholder",
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
