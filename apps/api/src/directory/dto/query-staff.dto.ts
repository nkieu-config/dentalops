import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsIn, IsOptional } from "class-validator"

export class QueryStaffDto {
  @ApiPropertyOptional({ enum: ["owner", "receptionist", "dentist"] })
  @IsOptional()
  @IsIn(["owner", "receptionist", "dentist"])
  role?: "owner" | "receptionist" | "dentist"
}
