import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { QueryStaffDto } from "./dto/query-staff.dto"

@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  branches() {
    return this.prisma.scoped.branch.findMany({
      select: { id: true, name: true, openingHours: true },
      orderBy: { name: "asc" }
    })
  }

  staff(query: QueryStaffDto) {
    return this.prisma.scoped.user.findMany({
      where: { role: query.role },
      select: { id: true, name: true, role: true, isActive: true },
      orderBy: { name: "asc" }
    })
  }

  services() {
    return this.prisma.scoped.service.findMany({
      select: {
        id: true,
        name: true,
        durationMin: true,
        bufferMin: true,
        colorIndex: true,
        isActive: true
      },
      orderBy: { name: "asc" }
    })
  }
}
