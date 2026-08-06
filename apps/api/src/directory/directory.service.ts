import { Injectable } from "@nestjs/common"
import { PrismaService } from "../prisma/prisma.service"
import { QueryResourcesDto } from "./dto/query-resources.dto"
import { QueryStaffDto } from "./dto/query-staff.dto"

@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  branches() {
    return this.prisma.scoped.branch.findMany({
      where: { isActive: true },
      select: { id: true, name: true, timezone: true, openingHours: true, isActive: true },
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

  resources(query: QueryResourcesDto) {
    return this.prisma.scoped.resource.findMany({
      where: {
        branchId: query.branchId,
        type: query.type,
        ...(query.includeInactive === "true" ? {} : { isActive: true })
      },
      select: { id: true, name: true, type: true, branchId: true, equipmentTypeId: true, isActive: true },
      orderBy: { name: "asc" }
    })
  }

  equipmentTypes() {
    return this.prisma.scoped.equipmentType.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    })
  }
}
