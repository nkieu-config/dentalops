import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Patch, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { Roles } from "../auth/roles.decorator"
import { DeleteShiftSeriesDto, UpdateShiftSeriesDto } from "./dto/update-shift-series.dto"
import { ShiftSeriesService } from "./shift-series.service"

@SkipThrottle()
@ApiTags("shifts")
@ApiBearerAuth()
@Controller("shift-series")
export class ShiftSeriesController {
  constructor(private readonly series: ShiftSeriesService) {}

  @Patch(":id")
  @Roles("owner")
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateShiftSeriesDto) {
    return this.series.update(id, dto)
  }

  @Delete(":id")
  @Roles("owner")
  @HttpCode(204)
  async remove(@Param("id", ParseUUIDPipe) id: string, @Query() query: DeleteShiftSeriesDto) {
    await this.series.remove(id, query.scope ?? "following")
  }
}
