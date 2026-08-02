import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min
} from "class-validator"

export const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/
export const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/

export class CreateShiftSeriesDto {
  @ApiProperty()
  @IsUUID()
  staffId!: string

  @ApiProperty()
  @IsUUID()
  branchId!: string

  @ApiProperty({ enum: ["weekly", "monthly_date"] })
  @IsIn(["weekly", "monthly_date"])
  freq!: "weekly" | "monthly_date"

  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  interval!: number

  @ApiProperty({ example: [1, 3, 5], description: "0 = Sunday; ignored by monthly_date" })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  byWeekday!: number[]

  @ApiProperty({ example: "09:00", description: "Local Bangkok start time" })
  @Matches(TIME_OF_DAY)
  timeStart!: string

  @ApiProperty({ minimum: 15, maximum: 1440 })
  @IsInt()
  @Min(15)
  @Max(1440)
  durationMin!: number

  @ApiProperty({ example: "2026-08-03" })
  @Matches(LOCAL_DATE)
  startsOn!: string

  @ApiPropertyOptional({ example: "2027-08-03" })
  @IsOptional()
  @Matches(LOCAL_DATE)
  endsOn?: string
}
