import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { Roles } from "../auth/roles.decorator"
import { CreateShiftDto } from "./dto/create-shift.dto"
import { CreateShiftSeriesDto } from "./dto/create-shift-series.dto"
import { QueryShiftsDto } from "./dto/query-shifts.dto"
import { ShiftSeriesService } from "./shift-series.service"
import { ShiftsService } from "./shifts.service"

@SkipThrottle()
@ApiTags("shifts")
@ApiBearerAuth()
@Controller("shifts")
export class ShiftsController {
  constructor(
    private readonly shifts: ShiftsService,
    private readonly series: ShiftSeriesService
  ) {}

  @Get()
  list(@Query() query: QueryShiftsDto) {
    return this.shifts.list(query)
  }

  @Post()
  @Roles("owner")
  create(@Body() dto: CreateShiftDto) {
    return this.shifts.create(dto)
  }

  @Post("series")
  @Roles("owner")
  createSeries(@Body() dto: CreateShiftSeriesDto) {
    return this.series.create(dto)
  }

  @Delete(":id")
  @Roles("owner")
  @HttpCode(204)
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.shifts.remove(id)
  }
}
