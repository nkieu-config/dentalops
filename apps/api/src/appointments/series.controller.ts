import { Body, Controller, Param, ParseUUIDPipe, Patch, UseInterceptors } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { Roles } from "../auth/roles.decorator"
import { IdempotencyInterceptor } from "../common/idempotency.interceptor"
import { EditSeriesDto } from "./dto/edit-series.dto"
import { SeriesService } from "./series.service"

@SkipThrottle()
@ApiTags("appointments")
@ApiBearerAuth()
@Controller("series")
export class SeriesController {
  constructor(private readonly series: SeriesService) {}

  @Patch(":id")
  @Roles("owner", "receptionist")
  @UseInterceptors(IdempotencyInterceptor)
  edit(@Param("id", ParseUUIDPipe) id: string, @Body() dto: EditSeriesDto) {
    return this.series.edit(id, dto)
  }
}
