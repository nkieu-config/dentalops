import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { Transform } from "class-transformer"
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator"

export class CreateResourceDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string

  @ApiProperty()
  @IsUUID()
  branchId!: string

  @ApiProperty({ enum: ["chair", "equipment"] })
  @IsIn(["chair", "equipment"])
  type!: "chair" | "equipment"

  @ApiPropertyOptional({ format: "uuid" })
  @IsOptional()
  @IsUUID()
  equipmentTypeId?: string
}
