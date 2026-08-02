import { ApiProperty } from "@nestjs/swagger"
import { IsUUID } from "class-validator"

export class RescheduleByTokenDto {
  @ApiProperty()
  @IsUUID()
  holdId!: string
}
