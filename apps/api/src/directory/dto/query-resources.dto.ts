import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsBooleanString, IsIn, IsOptional, IsUUID } from "class-validator"

export class QueryResourcesDto {
  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  branchId?: string

  @ApiPropertyOptional({ enum: ["chair", "equipment"] })
  @IsOptional()
  @IsIn(["chair", "equipment"])
  type?: "chair" | "equipment"

  @ApiPropertyOptional({ enum: ["true", "false"] })
  @IsOptional()
  @IsBooleanString()
  includeInactive?: "true" | "false"
}
