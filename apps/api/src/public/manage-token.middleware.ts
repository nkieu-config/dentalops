import { Injectable, NestMiddleware } from "@nestjs/common"
import type { NextFunction, Request, Response } from "express"
import { tenantContext } from "../tenant/tenant-context"
import { ManageTokenService } from "./manage-token.service"

function tokenFromRequest(req: Request): string {
  const fromParams = req.params.token
  if (typeof fromParams === "string" && fromParams) return fromParams
  const path = req.originalUrl.split("?")[0] ?? ""
  const segments = path.split("/").filter(Boolean)
  const manageIndex = segments.lastIndexOf("manage")
  return manageIndex < 0 ? "" : (segments[manageIndex + 1] ?? "")
}

@Injectable()
export class ManageTokenMiddleware implements NestMiddleware {
  constructor(private readonly manageTokens: ManageTokenService) {}

  async use(req: Request, _res: Response, next: NextFunction) {
    const claims = await this.manageTokens.verify(tokenFromRequest(req))
    tenantContext.run(
      { tenantId: claims.tenantId, userId: "public", role: "public", name: "Guest" },
      () => next()
    )
  }
}
