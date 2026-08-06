import { Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { currentTenant } from "./tenant-context"
import { UpdateTenantDto } from "./dto/update-tenant.dto"

const clinicNotFound = () => new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")
const slugTaken = () => new AppException(409, "SLUG_TAKEN", "That clinic URL is already in use")

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  async profile() {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: this.tenantId() },
      select: { id: true, name: true, slug: true }
    })
    if (!tenant) throw clinicNotFound()
    return this.withBookingPath(tenant)
  }

  async update(dto: UpdateTenantDto) {
    if (dto.name === undefined && dto.slug === undefined) {
      throw new AppException(400, "EMPTY_UPDATE", "Provide a clinic name or slug")
    }

    const tenantId = this.tenantId()
    const slug = dto.slug
    if (slug) {
      const existing = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } })
      if (existing && existing.id !== tenantId) throw slugTaken()
    }

    try {
      const tenant = await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(slug === undefined ? {} : { slug })
        },
        select: { id: true, name: true, slug: true }
      })
      return this.withBookingPath(tenant)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw clinicNotFound()
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw slugTaken()
      }
      throw error
    }
  }

  private tenantId() {
    const context = currentTenant()
    if (!context) throw clinicNotFound()
    return context.tenantId
  }

  private withBookingPath(tenant: { id: string; name: string; slug: string }) {
    return { ...tenant, publicBookingPath: `/book/${tenant.slug}` }
  }
}
