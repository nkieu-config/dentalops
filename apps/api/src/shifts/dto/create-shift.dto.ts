import { ApiProperty } from "@nestjs/swagger"
import { IsISO8601, IsUUID } from "class-validator"

export class CreateShiftDto {
  @ApiProperty()
  @IsUUID()
  staffId!: string

  @ApiProperty()
  @IsUUID()
  branchId!: string

  @ApiProperty({ example: "2026-08-03T02:00:00.000Z" })
  @IsISO8601()
  startsAt!: string

  @ApiProperty({ example: "2026-08-03T10:00:00.000Z" })
  @IsISO8601()
  endsAt!: string
}
