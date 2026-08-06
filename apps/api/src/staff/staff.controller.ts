import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Roles } from "../auth/roles.decorator"
import { CreateStaffDto } from "./dto/create-staff.dto"
import { UpdateStaffDto } from "./dto/update-staff.dto"
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

  @Patch(":id")
  @Roles("owner")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(id, dto)
  }
}
