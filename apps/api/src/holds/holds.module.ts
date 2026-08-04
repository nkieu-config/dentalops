import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"
import { HoldsService } from "./holds.service"

@Module({
  imports: [JwtModule.register({})],
  providers: [HoldsService],
  exports: [HoldsService]
})
export class HoldsModule {}
