import { ApiProperty } from "@nestjs/swagger"
import { IsIn } from "class-validator"

export class DemoLoginDto {
  @ApiProperty({ enum: ["owner", "receptionist", "dentist"] })
  @IsIn(["owner", "receptionist", "dentist"])
  role!: "owner" | "receptionist" | "dentist"
}
