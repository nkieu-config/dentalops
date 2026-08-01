import { Module } from "@nestjs/common"
import { AvailabilityModule } from "../availability/availability.module"
import { HoldsModule } from "../holds/holds.module"
import { PublicController } from "./public.controller"
import { PublicService } from "./public.service"

@Module({
  imports: [AvailabilityModule, HoldsModule],
  controllers: [PublicController],
  providers: [PublicService]
})
export class PublicModule {}
