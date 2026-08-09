import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { CreateBranchDto } from "./dto/create-branch.dto"
import { CreateResourceDto } from "./dto/create-resource.dto"
import { CreateServiceDto } from "./dto/create-service.dto"
import { UpdateBranchDto } from "./dto/update-branch.dto"
import { UpdateResourceDto } from "./dto/update-resource.dto"
import { UpdateServiceDto } from "./dto/update-service.dto"

const branchSelect = {
  id: true,
  name: true,
  timezone: true,
  openingHours: true,
  isActive: true
} satisfies Prisma.BranchSelect

const serviceSelect = {
  id: true,
  name: true,
  durationMin: true,
  bufferMin: true,
  colorIndex: true,
  isActive: true
} satisfies Prisma.ServiceSelect

const resourceSelect = {
  id: true,
  name: true,
  type: true,
  branchId: true,
  equipmentTypeId: true,
  isActive: true
} satisfies Prisma.ResourceSelect

const notFound = (entity: string) => new AppException(404, "NOT_FOUND", `${entity} not found`)
const emptyUpdate = () => new AppException(400, "EMPTY_UPDATE", "Provide at least one field to update")
const lastActiveBranch = () =>
  new AppException(409, "LAST_ACTIVE_BRANCH", "A clinic must keep at least one active branch")
const invalidResource = () =>
  new AppException(400, "INVALID_RESOURCE", "Equipment requires an equipment type; chairs do not")

@Injectable()
export class DirectoryWriteService {
  constructor(private readonly prisma: PrismaService) {}

  createBranch(dto: CreateBranchDto) {
    return this.prisma.scoped.branch.create({
      data: {
        name: dto.name,
        timezone: dto.timezone,
        openingHours: dto.openingHours as Prisma.InputJsonValue
      } as never,
      select: branchSelect
    })
  }

  async updateBranch(id: string, dto: UpdateBranchDto) {
    if (Object.keys(dto).length === 0) throw emptyUpdate()
    const existing = await this.prisma.scoped.branch.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw notFound("Branch")
    return this.prisma.scoped.branch.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.timezone === undefined ? {} : { timezone: dto.timezone }),
        ...(dto.openingHours === undefined
          ? {}
          : { openingHours: dto.openingHours as Prisma.InputJsonValue }),
        ...(dto.isActive === undefined ? {} : { isActive: dto.isActive })
      },
      select: branchSelect
    })
  }

  async deactivateBranch(id: string) {
    const branch = await this.prisma.scoped.branch.findUnique({ where: { id }, select: branchSelect })
    if (!branch) throw notFound("Branch")
    if (!branch.isActive) return branch
    const activeCount = await this.prisma.scoped.branch.count({ where: { isActive: true } })
    if (activeCount <= 1) throw lastActiveBranch()
    return this.prisma.scoped.branch.update({
      where: { id },
      data: { isActive: false },
      select: branchSelect
    })
  }

  createService(dto: CreateServiceDto) {
    return this.prisma.scoped.service.create({
      data: {
        name: dto.name,
        durationMin: dto.durationMin,
        bufferMin: dto.bufferMin ?? 0,
        colorIndex: dto.colorIndex ?? 0
      } as never,
      select: serviceSelect
    })
  }

  async updateService(id: string, dto: UpdateServiceDto) {
    if (Object.keys(dto).length === 0) throw emptyUpdate()
    const existing = await this.prisma.scoped.service.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw notFound("Service")
    return this.prisma.scoped.service.update({
      where: { id },
      data: dto,
      select: serviceSelect
    })
  }

  async deactivateService(id: string) {
    const existing = await this.prisma.scoped.service.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw notFound("Service")
    return this.prisma.scoped.service.update({
      where: { id },
      data: { isActive: false },
      select: serviceSelect
    })
  }

  async createResource(dto: CreateResourceDto) {
    await this.requireBranch(dto.branchId)
    if (dto.type === "chair" && dto.equipmentTypeId !== undefined) throw invalidResource()
    if (dto.type === "equipment" && dto.equipmentTypeId === undefined) throw invalidResource()
    if (dto.equipmentTypeId) await this.requireEquipmentType(dto.equipmentTypeId)
    return this.prisma.scoped.resource.create({
      data: {
        name: dto.name,
        branchId: dto.branchId,
        type: dto.type,
        equipmentTypeId: dto.equipmentTypeId ?? null
      } as never,
      select: resourceSelect
    })
  }

  async updateResource(id: string, dto: UpdateResourceDto) {
    if (Object.keys(dto).length === 0) throw emptyUpdate()
    const resource = await this.prisma.scoped.resource.findUnique({ where: { id }, select: resourceSelect })
    if (!resource) throw notFound("Resource")
    const equipmentTypeId = dto.equipmentTypeId === undefined ? resource.equipmentTypeId : dto.equipmentTypeId
    if ((resource.type === "chair" && equipmentTypeId !== null) || (resource.type === "equipment" && !equipmentTypeId)) {
      throw invalidResource()
    }
    if (dto.branchId) await this.requireBranch(dto.branchId)
    if (dto.equipmentTypeId) await this.requireEquipmentType(dto.equipmentTypeId)
    return this.prisma.scoped.resource.update({
      where: { id },
      data: dto,
      select: resourceSelect
    })
  }

  async deactivateResource(id: string) {
    const existing = await this.prisma.scoped.resource.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw notFound("Resource")
    return this.prisma.scoped.resource.update({
      where: { id },
      data: { isActive: false },
      select: resourceSelect
    })
  }

  private async requireBranch(id: string) {
    const branch = await this.prisma.scoped.branch.findFirst({ where: { id, isActive: true }, select: { id: true } })
    if (!branch) throw notFound("Branch")
  }

  private async requireEquipmentType(id: string) {
    const type = await this.prisma.scoped.equipmentType.findUnique({ where: { id }, select: { id: true } })
    if (!type) throw notFound("Equipment type")
  }
}
