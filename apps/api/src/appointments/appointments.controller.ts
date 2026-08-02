import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors
} from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { Roles } from "../auth/roles.decorator"
import { IdempotencyInterceptor } from "../common/idempotency.interceptor"
import { AppointmentsService } from "./appointments.service"
import { CreateAppointmentDto } from "./dto/create-appointment.dto"
import { CreateSeriesDto } from "./dto/create-series.dto"
import { QueryAppointmentsDto } from "./dto/query-appointments.dto"
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto"
import { SetStatusDto } from "./dto/set-status.dto"
import { SeriesService } from "./series.service"

@SkipThrottle()
@ApiTags("appointments")
@ApiBearerAuth()
@Controller("appointments")
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly series: SeriesService
  ) {}

  @Get()
  list(@Query() query: QueryAppointmentsDto) {
    return this.appointments.list(query)
  }

  @Post()
  @Roles("owner", "receptionist")
  @UseInterceptors(IdempotencyInterceptor)
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointments.create(dto)
  }

  @Post("series")
  @Roles("owner", "receptionist")
  @UseInterceptors(IdempotencyInterceptor)
  createSeries(@Body() dto: CreateSeriesDto) {
    return this.series.create(dto)
  }

  @Patch(":id")
  @Roles("owner", "receptionist")
  @UseInterceptors(IdempotencyInterceptor)
  reschedule(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RescheduleAppointmentDto) {
    return this.appointments.reschedule(id, dto)
  }

  @Patch(":id/status")
  @UseInterceptors(IdempotencyInterceptor)
  setStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SetStatusDto) {
    return this.appointments.setStatus(id, dto)
  }
}
