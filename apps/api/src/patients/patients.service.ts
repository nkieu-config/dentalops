import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { AppException } from "../common/app.exception"
import { decodeCursor, toPage } from "../common/pagination"
import { PrismaService } from "../prisma/prisma.service"
import { scoped } from "../prisma/scoped-input"
import { currentTenant } from "../tenant/tenant-context"
import { CreatePatientDto } from "./dto/create-patient.dto"
import { QueryPatientsDto } from "./dto/query-patients.dto"
import { UpdatePatientDto } from "./dto/update-patient.dto"

const HISTORY_LIMIT = 50

const HISTORY_INCLUDE = {
  branch: { select: { id: true, name: true } },
  service: { select: { id: true, name: true } },
  dentist: { select: { id: true, name: true } }
} satisfies Prisma.AppointmentInclude

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePatientDto) {
    try {
      return await this.prisma.scoped.patient.create({
        data: scoped<Prisma.PatientUncheckedCreateInput>({ ...dto, email: dto.email ?? "" })
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppException(
          409,
          "DUPLICATE_PATIENT",
          "A patient with this phone number already exists"
        )
      }
      throw e
    }
  }

  async list(query: QueryPatientsDto) {
    const limit = query.limit ?? 20
    const cursor = decodeCursor(query.cursor)
    const rows = await this.prisma.scoped.patient.findMany({
      where: {
        AND: [
          query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: "insensitive" } },
                  { phone: { contains: query.q } }
                ]
              }
            : {},
          cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } }
                ]
              }
            : {}
        ]
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1
    })
    const page = toPage(rows, limit)
    const ids = page.items.map((patient) => patient.id)
    const upcoming = ids.length
      ? await this.prisma.scoped.appointment.findMany({
          where: { patientId: { in: ids }, status: "confirmed", startsAt: { gte: new Date() } },
          orderBy: [{ patientId: "asc" }, { startsAt: "asc" }],
          distinct: ["patientId"],
          select: { patientId: true, startsAt: true }
        })
      : []
    const nextAppointmentByPatient = new Map(upcoming.map((a) => [a.patientId, a.startsAt]))
    return {
      ...page,
      items: page.items.map((patient) => ({
        ...patient,
        nextAppointmentAt: nextAppointmentByPatient.get(patient.id)?.toISOString() ?? null
      }))
    }
  }

  async update(id: string, dto: UpdatePatientDto) {
    try {
      return await this.prisma.scoped.patient.update({ where: { id }, data: { ...dto } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") {
          throw new AppException(
            409,
            "DUPLICATE_PATIENT",
            "A patient with this phone number already exists"
          )
        }
        if (e.code === "P2025") throw new AppException(404, "NOT_FOUND", "Patient not found")
      }
      throw e
    }
  }

  async get(id: string) {
    const actor = currentTenant()
    const patient = await this.prisma.scoped.patient.findUnique({
      where: { id },
      include: {
        appointments: {
          where: { dentistId: actor?.role === "dentist" ? actor.userId : undefined },
          include: HISTORY_INCLUDE,
          orderBy: [{ startsAt: "desc" }, { id: "desc" }],
          take: HISTORY_LIMIT
        }
      }
    })
    if (!patient) throw new AppException(404, "NOT_FOUND", "Patient not found")
    return patient
  }
}
