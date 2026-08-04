import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator"
import { HOLD_ID_MESSAGE, HOLD_ID_PATTERN, MAX_HOLD_ID_LENGTH } from "../../holds/hold-id"

export class ConfirmBookingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(MAX_HOLD_ID_LENGTH)
  @Matches(HOLD_ID_PATTERN, { message: HOLD_ID_MESSAGE })
  holdId!: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @ApiProperty({ example: "0812345678" })
  @Matches(/^0\d{8,9}$/)
  phone!: string

  @ApiPropertyOptional({ example: "patient@example.com" })
  @IsOptional()
  @IsEmail()
  email?: string
}
