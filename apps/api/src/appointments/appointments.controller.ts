import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Roles } from "../auth/roles.decorator"
import { AppointmentsService } from "./appointments.service"
import { CreateAppointmentDto } from "./dto/create-appointment.dto"
import { QueryAppointmentsDto } from "./dto/query-appointments.dto"
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto"
import { SetStatusDto } from "./dto/set-status.dto"

@ApiTags("appointments")
@ApiBearerAuth()
@Controller("appointments")
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@Query() query: QueryAppointmentsDto) {
    return this.appointments.list(query)
  }

  @Post()
  @Roles("owner", "receptionist")
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointments.create(dto)
  }

  @Patch(":id")
  @Roles("owner", "receptionist")
  reschedule(@Param("id", ParseUUIDPipe) id: string, @Body() dto: RescheduleAppointmentDto) {
    return this.appointments.reschedule(id, dto)
  }

  @Patch(":id/status")
  setStatus(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SetStatusDto) {
    return this.appointments.setStatus(id, dto)
  }
}
