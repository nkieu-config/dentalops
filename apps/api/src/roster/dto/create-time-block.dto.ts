import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator"

export class CreateTimeBlockDto {
  @ApiPropertyOptional({ description: "Omit for a branch-wide closure" })
  @IsOptional()
  @IsUUID()
  staffId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string

  @ApiProperty({ example: "Lunch" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  reason!: string

  @ApiProperty({ example: "2026-08-03T05:00:00.000Z" })
  @IsISO8601()
  startsAt!: string

  @ApiProperty({ example: "2026-08-03T06:00:00.000Z" })
  @IsISO8601()
  endsAt!: string
}

export class QueryTimeBlocksDto {
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
