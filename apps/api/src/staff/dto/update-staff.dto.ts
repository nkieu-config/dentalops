import { ApiPropertyOptional } from "@nestjs/swagger"
import { Transform } from "class-transformer"
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator"

export class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string

  @ApiPropertyOptional({ enum: ["dentist", "receptionist"] })
  @IsOptional()
  @IsIn(["dentist", "receptionist"])
  role?: "dentist" | "receptionist"

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
