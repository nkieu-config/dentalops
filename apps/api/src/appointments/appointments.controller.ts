import { Body, Controller, Get, Post, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { Roles } from "../auth/roles.decorator"
import { AppointmentsService } from "./appointments.service"
import { CreateAppointmentDto } from "./dto/create-appointment.dto"
import { QueryAppointmentsDto } from "./dto/query-appointments.dto"

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
}
