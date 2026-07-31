import { randomUUID } from "node:crypto"
import { Injectable, NestMiddleware } from "@nestjs/common"
import type { NextFunction, Request, Response } from "express"

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { id?: string }, res: Response, next: NextFunction) {
    req.id = randomUUID()
    res.setHeader("x-request-id", req.id)
    next()
  }
}
