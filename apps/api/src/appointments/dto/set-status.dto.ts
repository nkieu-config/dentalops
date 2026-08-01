import { ApiProperty } from "@nestjs/swagger"
import { IsIn } from "class-validator"

export class SetStatusDto {
  @ApiProperty({ enum: ["completed", "no_show", "cancelled"] })
  @IsIn(["completed", "no_show", "cancelled"])
  status!: "completed" | "no_show" | "cancelled"
}
