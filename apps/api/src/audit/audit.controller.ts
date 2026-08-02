import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { Roles } from "../auth/roles.decorator"
import { AuditService } from "./audit.service"

const MIN_LIMIT = 1
const MAX_LIMIT = 100

@SkipThrottle()
@ApiTags("audit")
@ApiBearerAuth()
@Controller("audit-logs")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @Roles("owner")
  list(
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("cursor") cursor?: string
  ) {
    return this.audit.list({ cursor, limit: Math.min(Math.max(limit, MIN_LIMIT), MAX_LIMIT) })
  }
}
