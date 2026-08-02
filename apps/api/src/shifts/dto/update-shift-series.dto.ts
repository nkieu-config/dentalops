import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min
} from "class-validator"
import { TIME_OF_DAY } from "./create-shift-series.dto"

export type SeriesScope = "following" | "all"

export class UpdateShiftSeriesDto {
  @ApiProperty({ enum: ["following", "all"] })
  @IsIn(["following", "all"])
  scope!: SeriesScope

  @ApiPropertyOptional({
    example: "2026-09-14T02:00:00.000Z",
    description: "Boundary for scope following; defaults to now. Snapped to the local day"
  })
  @IsOptional()
  @IsISO8601()
  from?: string

  @ApiPropertyOptional({ example: "13:00" })
  @IsOptional()
  @Matches(TIME_OF_DAY)
  timeStart?: string

  @ApiPropertyOptional({ minimum: 15, maximum: 1440 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(1440)
  durationMin?: number

  @ApiPropertyOptional({ example: [1, 3, 5] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  byWeekday?: number[]

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  interval?: number
}

export class DeleteShiftSeriesDto {
  @ApiPropertyOptional({ enum: ["following", "all"], default: "following" })
  @IsOptional()
  @IsIn(["following", "all"])
  scope?: SeriesScope
}
