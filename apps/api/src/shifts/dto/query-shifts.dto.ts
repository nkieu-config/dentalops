import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsISO8601, IsOptional, IsUUID } from "class-validator"

export class QueryShiftsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  staffId?: string

  @ApiPropertyOptional({ example: "2026-08-03T00:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  from?: string

  @ApiPropertyOptional({ example: "2026-08-10T00:00:00.000Z" })
  @IsOptional()
  @IsISO8601()
  to?: string
}
