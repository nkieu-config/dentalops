import { Controller, Get, Query } from "@nestjs/common"
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger"
import { SkipThrottle } from "@nestjs/throttler"
import { DirectoryService } from "./directory.service"
import { QueryStaffDto } from "./dto/query-staff.dto"

@SkipThrottle()
@ApiTags("directory")
@ApiBearerAuth()
@Controller()
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Get("branches")
  branches() {
    return this.directory.branches()
  }

  @Get("staff")
  staff(@Query() query: QueryStaffDto) {
    return this.directory.staff(query)
  }

  @Get("services")
  services() {
    return this.directory.services()
  }
}
