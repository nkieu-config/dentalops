import { Module } from "@nestjs/common"
import { AvailabilityCache } from "./availability.cache"
import { AvailabilityController } from "./availability.controller"
import { AvailabilityService } from "./availability.service"

@Module({
  controllers: [AvailabilityController],
  providers: [AvailabilityCache, AvailabilityService],
  exports: [AvailabilityCache, AvailabilityService]
})
export class AvailabilityModule {}
