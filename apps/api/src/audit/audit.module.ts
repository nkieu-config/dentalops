import { Global, Module } from "@nestjs/common"
import { AuditService } from "./audit.service"
import { mongoProvider } from "./mongo.provider"

@Global()
@Module({
  providers: [mongoProvider, AuditService],
  exports: [AuditService]
})
export class AuditModule {}
