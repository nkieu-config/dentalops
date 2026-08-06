import { Body, Controller, Get, Patch } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Roles } from "../auth/roles.decorator"
import { UpdateTenantDto } from "./dto/update-tenant.dto"
import { TenantService } from "./tenant.service"

@ApiTags("tenant")
@ApiBearerAuth()
@Controller("tenant")
@Roles("owner")
export class TenantController {
  constructor(private readonly tenant: TenantService) {}

  @Get()
  profile() {
    return this.tenant.profile()
  }

  @Patch()
  update(@Body() dto: UpdateTenantDto) {
    return this.tenant.update(dto)
  }
}
