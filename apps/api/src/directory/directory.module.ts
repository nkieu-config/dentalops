import { Module } from "@nestjs/common"
import { DirectoryController } from "./directory.controller"
import { DirectoryWriteController } from "./directory-write.controller"
import { DirectoryWriteService } from "./directory-write.service"
import { DirectoryService } from "./directory.service"
import { OpeningHoursConstraint } from "./dto/opening-hours.validator"

@Module({
  controllers: [DirectoryController, DirectoryWriteController],
  providers: [DirectoryService, DirectoryWriteService, OpeningHoursConstraint]
})
export class DirectoryModule {}
