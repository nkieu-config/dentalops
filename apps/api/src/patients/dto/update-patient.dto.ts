import { ApiPropertyOptional } from "@nestjs/swagger"
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from "class-validator"

export class UpdatePatientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string

  @ApiPropertyOptional({ example: "0812345678" })
  @IsOptional()
  @Matches(/^0\d{8,9}$/)
  phone?: string

  @ApiPropertyOptional({ example: "patient@example.com" })
  @IsOptional()
  @ValidateIf((dto) => dto.email !== "")
  @IsEmail()
  email?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string
}
