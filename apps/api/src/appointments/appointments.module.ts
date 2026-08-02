import { Module } from "@nestjs/common"
import { RealtimeModule } from "../realtime/realtime.module"
import { AppointmentsController } from "./appointments.controller"
import { AppointmentsService } from "./appointments.service"
import { SeriesController } from "./series.controller"
import { SeriesService } from "./series.service"

@Module({
  imports: [RealtimeModule],
  controllers: [AppointmentsController, SeriesController],
  providers: [AppointmentsService, SeriesService],
  exports: [AppointmentsService, SeriesService]
})
export class AppointmentsModule {}
