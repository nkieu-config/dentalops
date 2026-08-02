import { ApiProperty } from "@nestjs/swagger"
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsUUID,
  Max,
  Min
} from "class-validator"

export class CreateSeriesDto {
  @ApiProperty()
  @IsUUID()
  serviceId!: string

  @ApiProperty()
  @IsUUID()
  dentistId!: string

  @ApiProperty()
  @IsUUID()
  patientId!: string

  @ApiProperty()
  @IsUUID()
  branchId!: string

  @ApiProperty({
    example: "2026-08-10T02:00:00.000Z",
    description: "The first occurrence; the recurrence rule is anchored to it"
  })
  @IsISO8601()
  startsAt!: string

  @ApiProperty({ enum: ["weekly", "monthly_date"] })
  @IsIn(["weekly", "monthly_date"])
  freq!: "weekly" | "monthly_date"

  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  interval!: number

  @ApiProperty({ example: [1, 3], description: "0 = Sunday; ignored by monthly_date" })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  byWeekday!: number[]

  @ApiProperty({ minimum: 2, maximum: 52 })
  @IsInt()
  @Min(2)
  @Max(52)
  count!: number
}
