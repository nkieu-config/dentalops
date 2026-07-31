import { ApiProperty } from "@nestjs/swagger"
import { IsEmail, IsString, Matches, MinLength } from "class-validator"

export class LoginDto {
  @ApiProperty()
  @Matches(/^[a-z0-9-]{3,40}$/)
  clinicSlug!: string

  @ApiProperty()
  @IsEmail()
  email!: string

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string
}
