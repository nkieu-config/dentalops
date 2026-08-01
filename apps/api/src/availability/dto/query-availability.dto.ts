import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsISO8601, IsOptional, IsUUID } from "class-validator"

export class QueryAvailabilityDto {
  @ApiProperty()
  @IsUUID()
  serviceId!: string

  @ApiProperty()
  @IsUUID()
  branchId!: string

  @ApiProperty({ example: "2026-08-10T00:00:00.000Z" })
  @IsISO8601()
  from!: string

  @ApiProperty({ example: "2026-08-17T00:00:00.000Z" })
  @IsISO8601()
  to!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string
}
