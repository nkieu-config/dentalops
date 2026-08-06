import { ApiPropertyOptional } from "@nestjs/swagger"
import { Transform } from "class-transformer"
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator"

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string

  @ApiPropertyOptional({ description: "URL-safe unique identifier for the clinic" })
  @IsOptional()
  @Matches(/^[a-z0-9-]{3,40}$/)
  slug?: string
}
