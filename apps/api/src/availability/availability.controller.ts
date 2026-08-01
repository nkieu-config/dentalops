import { Controller, Get, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { AvailabilityService } from "./availability.service"
import { QueryAvailabilityDto } from "./dto/query-availability.dto"

@SkipThrottle()
@ApiTags("availability")
@ApiBearerAuth()
@Controller("availability")
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  slots(@Query() query: QueryAvailabilityDto) {
    return this.availability.slots(query)
  }
}
