import { Module } from "@nestjs/common"
import { RosterController } from "./roster.controller"
import { RosterService } from "./roster.service"
import { TimeBlocksController } from "./time-blocks.controller"
import { TimeBlocksService } from "./time-blocks.service"

@Module({
  controllers: [RosterController, TimeBlocksController],
  providers: [RosterService, TimeBlocksService],
  exports: [RosterService, TimeBlocksService]
})
export class RosterModule {}
