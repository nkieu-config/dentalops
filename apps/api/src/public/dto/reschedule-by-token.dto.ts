import { ApiProperty } from "@nestjs/swagger"
import { IsString, Matches, MaxLength } from "class-validator"
import { HOLD_ID_MESSAGE, HOLD_ID_PATTERN, MAX_HOLD_ID_LENGTH } from "../../holds/hold-id"

export class RescheduleByTokenDto {
  @ApiProperty()
  @IsString()
  @MaxLength(MAX_HOLD_ID_LENGTH)
  @Matches(HOLD_ID_PATTERN, { message: HOLD_ID_MESSAGE })
  holdId!: string
}
