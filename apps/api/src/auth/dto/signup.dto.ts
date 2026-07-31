import { ApiProperty } from "@nestjs/swagger"
import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator"

export class SignupDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  clinicName!: string

  @ApiProperty({ description: "URL-safe unique identifier for the clinic" })
  @Matches(/^[a-z0-9-]{3,40}$/)
  slug!: string

  @ApiProperty()
  @IsEmail()
  email!: string

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string
}
