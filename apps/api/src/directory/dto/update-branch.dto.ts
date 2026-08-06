import { ApiPropertyOptional } from "@nestjs/swagger"
import { Transform } from "class-transformer"
import { IsObject, IsOptional, IsString, MaxLength, MinLength, Validate } from "class-validator"
import { OpeningHoursConstraint } from "./opening-hours.validator"

export class UpdateBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  timezone?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @Validate(OpeningHoursConstraint)
  openingHours?: Record<string, unknown>
}
