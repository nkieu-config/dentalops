import { Injectable } from "@nestjs/common"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { CreateShiftDto } from "./dto/create-shift.dto"
import { QueryShiftsDto } from "./dto/query-shifts.dto"

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: QueryShiftsDto) {
    return this.prisma.scoped.shift.findMany({
      where: {
        branchId: query.branchId,
        staffId: query.staffId,
        startsAt: query.to ? { lt: new Date(query.to) } : undefined,
        endsAt: query.from ? { gt: new Date(query.from) } : undefined
      },
      orderBy: { startsAt: "asc" }
    })
  }

  async create(dto: CreateShiftDto) {
    const startsAt = new Date(dto.startsAt)
    const endsAt = new Date(dto.endsAt)
    if (startsAt >= endsAt) {
      throw new AppException(400, "INVALID_RANGE", "startsAt must be before endsAt")
    }
    const staff = await this.prisma.scoped.user.findUnique({ where: { id: dto.staffId } })
    if (!staff) throw new AppException(404, "NOT_FOUND", "Staff member not found")
    const branch = await this.prisma.scoped.branch.findUnique({ where: { id: dto.branchId } })
    if (!branch) throw new AppException(404, "NOT_FOUND", "Branch not found")

    return this.prisma.scoped.shift.create({
      data: {
        staffId: dto.staffId,
        branchId: dto.branchId,
        startsAt,
        endsAt
      } as never
    })
  }

  remove(id: string) {
    return this.prisma.scoped.shift.delete({ where: { id } })
  }
}
