import { Controller, Get } from "@nestjs/common"
import { ApiTags } from "@nestjs/swagger"
import { Public } from "../auth/public.decorator"
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
}
