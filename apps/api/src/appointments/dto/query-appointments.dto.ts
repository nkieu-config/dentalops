import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsISO8601, IsOptional, IsUUID } from "class-validator"

export class QueryAppointmentsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string
}
