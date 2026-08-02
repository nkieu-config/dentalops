import { Module } from "@nestjs/common"
import { AvailabilityModule } from "../availability/availability.module"
import { RosterController } from "./roster.controller"
import { RosterService } from "./roster.service"
import { TimeBlocksController } from "./time-blocks.controller"
import { TimeBlocksService } from "./time-blocks.service"

@Module({
  imports: [AvailabilityModule],
  controllers: [RosterController, TimeBlocksController],
  providers: [RosterService, TimeBlocksService],
  exports: [RosterService, TimeBlocksService]
})
export class RosterModule {}
