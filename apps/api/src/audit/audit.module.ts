import { Global, Module } from "@nestjs/common"
import { AuditController } from "./audit.controller"
import { AuditService } from "./audit.service"
import { mongoProvider } from "./mongo.provider"

@Global()
@Module({
  controllers: [AuditController],
  providers: [mongoProvider, AuditService],
  exports: [AuditService]
})
export class AuditModule {}
