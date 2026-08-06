import { ApiProperty } from "@nestjs/swagger"
import { Transform } from "class-transformer"
import { IsObject, IsString, MaxLength, MinLength, Validate } from "class-validator"
import { OpeningHoursConstraint } from "./opening-hours.validator"

export class CreateBranchDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  timezone!: string

  @ApiProperty()
  @IsObject()
  @Validate(OpeningHoursConstraint)
  openingHours!: Record<string, unknown>
}
