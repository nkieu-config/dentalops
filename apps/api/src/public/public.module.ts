import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"
import { AppointmentsModule } from "../appointments/appointments.module"
import { AvailabilityModule } from "../availability/availability.module"
import { HoldsModule } from "../holds/holds.module"
import { MailModule } from "../mail/mail.module"
import { ManageTokenService } from "./manage-token.service"
import { PublicManageController } from "./public-manage.controller"
import { PublicController } from "./public.controller"
import { PublicService } from "./public.service"

@Module({
  imports: [
    AvailabilityModule,
    HoldsModule,
    AppointmentsModule,
    MailModule,
    JwtModule.register({})
  ],
  controllers: [PublicManageController, PublicController],
  providers: [PublicService, ManageTokenService],
  exports: [ManageTokenService]
})
export class PublicModule {}
