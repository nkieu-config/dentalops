import { Injectable } from "@nestjs/common"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { CreateTimeBlockDto, QueryTimeBlocksDto } from "./dto/create-time-block.dto"

@Injectable()
export class TimeBlocksService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: QueryTimeBlocksDto) {
    return this.prisma.scoped.timeBlock.findMany({
      where: {
        ...(query.branchId
          ? { OR: [{ branchId: query.branchId }, { branchId: null }] }
          : {}),
        staffId: query.staffId,
        startsAt: query.to ? { lt: new Date(query.to) } : undefined,
        endsAt: query.from ? { gt: new Date(query.from) } : undefined
      },
      orderBy: { startsAt: "asc" }
    })
  }

  async create(dto: CreateTimeBlockDto) {
    const startsAt = new Date(dto.startsAt)
    const endsAt = new Date(dto.endsAt)
    if (startsAt >= endsAt) {
      throw new AppException(400, "INVALID_RANGE", "startsAt must be before endsAt")
    }
    if (!dto.staffId && !dto.branchId) {
      throw new AppException(400, "INVALID_SCOPE", "A time block needs a staffId or a branchId")
    }
    if (dto.staffId) {
      const staff = await this.prisma.scoped.user.findUnique({ where: { id: dto.staffId } })
      if (!staff) throw new AppException(404, "NOT_FOUND", "Staff member not found")
    }
    if (dto.branchId) {
      const branch = await this.prisma.scoped.branch.findUnique({ where: { id: dto.branchId } })
      if (!branch) throw new AppException(404, "NOT_FOUND", "Branch not found")
    }

    return this.prisma.scoped.timeBlock.create({
      data: {
        staffId: dto.staffId ?? null,
        branchId: dto.branchId ?? null,
        reason: dto.reason,
        startsAt,
        endsAt
      } as never
    })
  }

  remove(id: string) {
    return this.prisma.scoped.timeBlock.delete({ where: { id } })
  }
}
