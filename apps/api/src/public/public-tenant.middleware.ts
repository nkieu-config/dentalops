import { Injectable, NestMiddleware } from "@nestjs/common"
import type { NextFunction, Request, Response } from "express"
import { AppException } from "../common/app.exception"
import { PrismaService } from "../prisma/prisma.service"
import { currentTenant, tenantContext } from "../tenant/tenant-context"

const clinicNotFound = () =>
  new AppException(404, "CLINIC_NOT_FOUND", "Clinic not found")

function slugFromRequest(req: Request): string | undefined {
  const fromParams = req.params.clinicSlug
  if (typeof fromParams === "string" && fromParams) return fromParams
  const path = req.originalUrl.split("?")[0] ?? ""
  const segments = path.split("/").filter(Boolean)
  const publicIndex = segments.lastIndexOf("public")
  if (publicIndex < 0) return undefined
  return segments[publicIndex + 1]
}

@Injectable()
export class PublicTenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    if (currentTenant()) return next()
    const slug = slugFromRequest(req)
    if (!slug) throw clinicNotFound()
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: { id: true }
    })
    if (!tenant) throw clinicNotFound()
    tenantContext.run(
      { tenantId: tenant.id, userId: "public", role: "public", name: "Guest" },
      () => next()
    )
  }
}
