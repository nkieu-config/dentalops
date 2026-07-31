import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { Roles } from "../auth/roles.decorator"
import { CreateShiftDto } from "./dto/create-shift.dto"
import { QueryShiftsDto } from "./dto/query-shifts.dto"
import { ShiftsService } from "./shifts.service"

@ApiTags("shifts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("shifts")
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  list(@Query() query: QueryShiftsDto) {
    return this.shifts.list(query)
  }

  @Post()
  @Roles("owner")
  create(@Body() dto: CreateShiftDto) {
    return this.shifts.create(dto)
  }

  @Delete(":id")
  @Roles("owner")
  @HttpCode(204)
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.shifts.remove(id)
  }
}
