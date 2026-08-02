import { ApiProperty } from "@nestjs/swagger"
import { IsEmail, IsIn, IsString, MaxLength, MinLength } from "class-validator"

export class CreateStaffDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string

  @ApiProperty()
  @IsEmail()
  email!: string

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string

  @ApiProperty({ enum: ["dentist", "receptionist"] })
  @IsIn(["dentist", "receptionist"])
  role!: "dentist" | "receptionist"
}
