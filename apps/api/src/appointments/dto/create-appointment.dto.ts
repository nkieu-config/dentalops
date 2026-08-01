import { ApiProperty } from "@nestjs/swagger"
import { IsISO8601, IsUUID } from "class-validator"

export class CreateAppointmentDto {
  @ApiProperty()
  @IsUUID()
  serviceId!: string

  @ApiProperty()
  @IsUUID()
  dentistId!: string

  @ApiProperty()
  @IsUUID()
  patientId!: string

  @ApiProperty()
  @IsUUID()
  branchId!: string

  @ApiProperty({ example: "2026-08-10T02:00:00.000Z" })
  @IsISO8601()
  startsAt!: string
}
