import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from "class-validator"
import { HOLD_ID_MESSAGE, HOLD_ID_PATTERN, MAX_HOLD_ID_LENGTH } from "../../holds/hold-id"

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
  @IsString()
  @MaxLength(MAX_HOLD_ID_LENGTH)
  @Matches(HOLD_ID_PATTERN, { message: HOLD_ID_MESSAGE })
  exceptHoldId?: string
}
