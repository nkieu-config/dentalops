import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger"
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator"

export class CreatePatientDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string

  @ApiProperty({ example: "0812345678" })
  @Matches(/^0\d{8,9}$/)
  phone!: string

  @ApiProperty({ example: "patient@example.com" })
  @IsEmail()
  email!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string
}
