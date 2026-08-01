import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { Roles } from "../auth/roles.decorator"
import { CreatePatientDto } from "./dto/create-patient.dto"
import { QueryPatientsDto } from "./dto/query-patients.dto"
import { PatientsService } from "./patients.service"

@SkipThrottle()
@ApiTags("patients")
@ApiBearerAuth()
@Controller("patients")
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  list(@Query() query: QueryPatientsDto) {
    return this.patients.list(query)
  }

  @Post()
  @Roles("owner", "receptionist")
  create(@Body() dto: CreatePatientDto) {
    return this.patients.create(dto)
  }

  @Get(":id")
  get(@Param("id", ParseUUIDPipe) id: string) {
    return this.patients.get(id)
  }
}
