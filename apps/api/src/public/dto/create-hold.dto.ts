import { ApiProperty } from "@nestjs/swagger"
import { IsISO8601, IsUUID } from "class-validator"

export class CreateHoldDto {
  @ApiProperty()
  @IsUUID()
  serviceId!: string

  @ApiProperty()
  @IsUUID()
  branchId!: string

  @ApiProperty()
  @IsUUID()
  dentistId!: string

  @ApiProperty({ example: "2026-08-10T02:00:00.000Z" })
  @IsISO8601()
  startsAt!: string
}
