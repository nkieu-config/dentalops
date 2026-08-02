import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsISO8601, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from "class-validator"

export type EditScope = "this" | "following" | "all"

export class EditSeriesDto {
  @ApiProperty({ enum: ["this", "following", "all"] })
  @IsIn(["this", "following", "all"])
  scope!: EditScope

  @ApiProperty({ description: "The occurrence the edit is anchored to" })
  @IsUUID()
  fromAppointmentId!: string

  @ApiPropertyOptional({ description: "Required for scope this; stale versions are rejected" })
  @ValidateIf((dto: EditSeriesDto) => dto.scope === "this")
  @IsInt()
  @Min(0)
  version?: number

  @ApiPropertyOptional({
    description: "New start for the anchor; every affected occurrence shifts by the same delta"
  })
  @IsOptional()
  @IsISO8601()
  startsAt?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  dentistId?: string

  @ApiPropertyOptional({ minimum: 15, maximum: 480 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMin?: number
}
