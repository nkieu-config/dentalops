import { Module } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup"
import { HealthController } from "./health/health.controller"
import { PrismaModule } from "./prisma/prisma.module"

@Module({
  imports: [SentryModule.forRoot(), PrismaModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }]
})
export class AppModule {}
