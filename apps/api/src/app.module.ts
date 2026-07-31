import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { SentryModule } from "@sentry/nestjs/setup"
import { AppExceptionFilter } from "./common/app-exception.filter"
import { RequestIdMiddleware } from "./common/request-id.middleware"
import { HealthController } from "./health/health.controller"
import { PrismaModule } from "./prisma/prisma.module"

@Module({
  imports: [SentryModule.forRoot(), PrismaModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes("*")
  }
}
