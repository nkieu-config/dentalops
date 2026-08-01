import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsOptional, IsUUID, Matches } from "class-validator"

export class QueryPublicAvailabilityDto {
  @ApiProperty()
  @IsUUID()
  serviceId!: string

  @ApiProperty()
  @IsUUID()
  branchId!: string

  @ApiProperty({ example: "2026-08-10" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date must be YYYY-MM-DD" })
  date!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  exceptHoldId?: string
}
