import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsISO8601, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator"

export class RescheduleAppointmentDto {
  @ApiProperty({ description: "Version the client last saw; stale versions are rejected" })
  @IsInt()
  @Min(0)
  version!: number

  @ApiPropertyOptional()
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
