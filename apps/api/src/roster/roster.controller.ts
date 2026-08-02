import { Body, Controller, HttpCode, Post } from "@nestjs/common"
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { Roles } from "../auth/roles.decorator"
import { ValidateRosterDto } from "./dto/validate-roster.dto"
import { RosterService } from "./roster.service"

@SkipThrottle()
@ApiTags("roster")
@ApiBearerAuth()
@Controller("roster")
export class RosterController {
  constructor(private readonly roster: RosterService) {}

  @Post("validate")
  @Roles("owner")
  @HttpCode(200)
  @ApiOperation({
    summary: "Dry run — reports what a draft roster would break and writes nothing"
  })
  validate(@Body() dto: ValidateRosterDto) {
    return this.roster.validate(dto)
  }
}
