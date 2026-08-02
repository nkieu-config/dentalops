import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Type } from "class-transformer"
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsUUID,
  ValidateNested
} from "class-validator"

export class DraftShiftDto {
  @ApiPropertyOptional({ description: "Present when the draft edits a persisted shift" })
  @IsOptional()
  @IsUUID()
  id?: string

  @ApiProperty()
  @IsUUID()
  staffId!: string

  @ApiProperty({ example: "2026-08-03T02:00:00.000Z" })
  @IsISO8601()
  startsAt!: string

  @ApiProperty({ example: "2026-08-03T08:00:00.000Z" })
  @IsISO8601()
  endsAt!: string
}

export class ValidateRosterDto {
  @ApiProperty()
  @IsUUID()
  branchId!: string

  @ApiProperty({ example: "2026-08-03T00:00:00.000Z" })
  @IsISO8601()
  from!: string

  @ApiProperty({ example: "2026-08-10T00:00:00.000Z" })
  @IsISO8601()
  to!: string

  @ApiProperty({
    type: [DraftShiftDto],
    description: "Replaces the persisted shifts of every staff member mentioned"
  })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DraftShiftDto)
  draftShifts!: DraftShiftDto[]
}
