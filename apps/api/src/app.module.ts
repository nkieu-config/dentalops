import { Module } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup"
import { HealthController } from "./health/health.controller"

@Module({
  imports: [SentryModule.forRoot()],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: SentryGlobalFilter }]
})
export class AppModule {}
