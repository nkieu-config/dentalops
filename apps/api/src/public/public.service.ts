import { Injectable } from "@nestjs/common"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { currentTenant } from "../tenant/tenant-context"

export interface PublicClinic {
  id: string
  name: string
  slug: string
  branches: Array<{ id: string; name: string }>
  services: Array<{ id: string; name: string; durationMin: number; colorIndex: number }>
}

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async clinic(): Promise<PublicClinic> {
    const ctx = currentTenant()
    if (!ctx) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")

    const [tenant, branches, services] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { id: true, name: true, slug: true }
      }),
      this.prisma.scoped.branch.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.scoped.service.findMany({
        where: { isActive: true },
        select: { id: true, name: true, durationMin: true, colorIndex: true },
        orderBy: { name: "asc" }
      })
    ])
    if (!tenant) throw new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")

    return { ...tenant, branches, services }
  }
}
