import { Body, Controller, Post } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Roles } from "../auth/roles.decorator"
import { CreateStaffDto } from "./dto/create-staff.dto"
import { StaffService } from "./staff.service"

@ApiTags("staff")
@ApiBearerAuth()
@Controller("staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Post()
  @Roles("owner")
  create(@Body() dto: CreateStaffDto) {
    return this.staff.create(dto)
  }
}
