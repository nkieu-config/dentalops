import { Module } from "@nestjs/common"
import { RealtimeModule } from "../realtime/realtime.module"
import { AppointmentsController } from "./appointments.controller"
import { AppointmentsService } from "./appointments.service"

@Module({
  imports: [RealtimeModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService]
})
export class AppointmentsModule {}
