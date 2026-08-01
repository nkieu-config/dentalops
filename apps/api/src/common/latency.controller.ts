import { Controller, Get } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { Roles } from "../auth/roles.decorator"
import { LatencyRegistry } from "./latency.registry"

@SkipThrottle()
@ApiTags("internal")
@ApiBearerAuth()
@Controller("internal")
export class LatencyController {
  constructor(private readonly registry: LatencyRegistry) {}

  @Get("latency")
  @Roles("owner")
  latency() {
    return this.registry.summary()
  }
}
