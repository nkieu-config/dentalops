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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { Roles } from "../auth/roles.decorator"
import { CreateTimeBlockDto, QueryTimeBlocksDto } from "./dto/create-time-block.dto"
import { TimeBlocksService } from "./time-blocks.service"

@SkipThrottle()
@ApiTags("roster")
@ApiBearerAuth()
@Controller("time-blocks")
export class TimeBlocksController {
  constructor(private readonly blocks: TimeBlocksService) {}

  @Get()
  @Roles("owner")
  list(@Query() query: QueryTimeBlocksDto) {
    return this.blocks.list(query)
  }

  @Post()
  @Roles("owner")
  create(@Body() dto: CreateTimeBlockDto) {
    return this.blocks.create(dto)
  }

  @Delete(":id")
  @Roles("owner")
  @HttpCode(204)
  async remove(@Param("id", ParseUUIDPipe) id: string) {
    await this.blocks.remove(id)
  }
}
