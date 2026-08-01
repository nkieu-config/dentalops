import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common"
import { APP_FILTER, APP_GUARD } from "@nestjs/core"
import { JwtModule } from "@nestjs/jwt"
import { SentryModule } from "@sentry/nestjs/setup"
import { AppointmentsModule } from "./appointments/appointments.module"
import { AuthModule } from "./auth/auth.module"
import { JwtAuthGuard } from "./auth/jwt-auth.guard"
import { RolesGuard } from "./auth/roles.guard"
import { AppExceptionFilter } from "./common/app-exception.filter"
import { RequestIdMiddleware } from "./common/request-id.middleware"
import { HealthController } from "./health/health.controller"
import { PrismaModule } from "./prisma/prisma.module"
import { ShiftsModule } from "./shifts/shifts.module"
import { TenantContextMiddleware } from "./tenant/tenant-context.middleware"

@Module({
  imports: [
    SentryModule.forRoot(),
    PrismaModule,
    JwtModule.register({}),
    AuthModule,
    ShiftsModule,
    AppointmentsModule
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, TenantContextMiddleware).forRoutes("*")
  }
}
