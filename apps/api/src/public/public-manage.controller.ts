import { Controller, Get, HttpCode, Param, Post } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { Public } from "../auth/public.decorator"
import { PublicService } from "./public.service"

@ApiTags("public")
@Public()
@Controller("public/manage")
export class PublicManageController {
  constructor(private readonly publicService: PublicService) {}

  @Get(":token")
  view(@Param("token") token: string) {
    return this.publicService.manageView(token)
  }

  @Post(":token/cancel")
  @HttpCode(204)
  async cancel(@Param("token") token: string) {
    await this.publicService.manageCancel(token)
  }
}
