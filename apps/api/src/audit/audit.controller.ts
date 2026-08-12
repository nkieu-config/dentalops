import { BadRequestException, Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { Roles } from "../auth/roles.decorator"
import { AuditService } from "./audit.service"

const MIN_LIMIT = 1
const MAX_LIMIT = 100
const ACTOR_TYPES = new Set(["staff", "public"])

const parseDate = (value: string | undefined, field: string): Date | undefined => {
  if (!value) return undefined
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${field} must be a valid date`)
  return parsed
}

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
    @Query("cursor") cursor?: string,
    @Query("entityTypes") entityTypes?: string,
    @Query("actorId") actorId?: string,
    @Query("actorType") actorType?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    if (actorType && !ACTOR_TYPES.has(actorType)) {
      throw new BadRequestException("actorType must be staff or public")
    }
    return this.audit.list({
      cursor,
      limit: Math.min(Math.max(limit, MIN_LIMIT), MAX_LIMIT),
      entityTypes: entityTypes ? entityTypes.split(",").filter(Boolean) : undefined,
      actorId,
      actorType: actorType as "staff" | "public" | undefined,
      from: parseDate(from, "from"),
      to: parseDate(to, "to")
    })
  }
}
