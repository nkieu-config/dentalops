import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Transform, Type } from "class-transformer"
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator"

export class CreateServiceDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(480)
  durationMin!: number

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  bufferMin?: number

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  colorIndex?: number
}
