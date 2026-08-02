import { Injectable, NestMiddleware } from "@nestjs/common"
import { JwtService } from "@nestjs/jwt"
import type { NextFunction, Request, Response } from "express"
import { JwtPayload } from "../auth/auth.service"
import { tenantContext } from "./tenant-context"

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const header = req.headers.authorization
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined
    if (!token) return next()
    try {
      const payload = this.jwt.verify<JwtPayload>(token, { secret: process.env.JWT_SECRET })
      tenantContext.run(
        { tenantId: payload.tenantId, userId: payload.sub, role: payload.role, name: payload.name },
        next
      )
    } catch {
      next()
    }
  }
}
