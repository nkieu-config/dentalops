import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query
} from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { Public } from "../auth/public.decorator"
import { CreateHoldDto } from "./dto/create-hold.dto"
import { QueryPublicAvailabilityDto } from "./dto/query-public-availability.dto"
import { PublicService } from "./public.service"

@ApiTags("public")
@Public()
@Controller("public/:clinicSlug")
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get()
  clinic() {
    return this.publicService.clinic()
  }

  @Get("availability")
  availability(@Query() query: QueryPublicAvailabilityDto) {
    return this.publicService.availableSlots(query)
  }

  @Post("holds")
  hold(@Body() body: CreateHoldDto) {
    return this.publicService.createHold(body)
  }

  @Delete("holds/:holdId")
  @HttpCode(204)
  async release(@Param("holdId", ParseUUIDPipe) holdId: string) {
    await this.publicService.releaseHold(holdId)
  }
}
