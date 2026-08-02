import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsISO8601, IsOptional } from "class-validator"

export class UpdateShiftDto {
  @ApiPropertyOptional({ example: "2026-08-03T02:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  startsAt?: string

  @ApiPropertyOptional({ example: "2026-08-03T10:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  endsAt?: string
}
