import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common"
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core"
import { JwtModule } from "@nestjs/jwt"
import { SentryModule } from "@sentry/nestjs/setup"
import { AppointmentsModule } from "./appointments/appointments.module"
import { AuthModule } from "./auth/auth.module"
import { AvailabilityModule } from "./availability/availability.module"
import { JwtAuthGuard } from "./auth/jwt-auth.guard"
import { RolesGuard } from "./auth/roles.guard"
import { AppExceptionFilter } from "./common/app-exception.filter"
import { LatencyController } from "./common/latency.controller"
import { LatencyInterceptor } from "./common/latency.interceptor"
import { LatencyRegistry } from "./common/latency.registry"
import { RequestIdMiddleware } from "./common/request-id.middleware"
import { DirectoryModule } from "./directory/directory.module"
import { HealthController } from "./health/health.controller"
import { PatientsModule } from "./patients/patients.module"
import { PrismaModule } from "./prisma/prisma.module"
import { RedisModule } from "./redis/redis.module"
import { ShiftsModule } from "./shifts/shifts.module"
import { TenantContextMiddleware } from "./tenant/tenant-context.middleware"

@Module({
  imports: [
    SentryModule.forRoot(),
    PrismaModule,
    RedisModule,
    JwtModule.register({}),
    AuthModule,
    ShiftsModule,
    AppointmentsModule,
    AvailabilityModule,
    PatientsModule,
    DirectoryModule
  ],
  controllers: [HealthController, LatencyController],
  providers: [
    LatencyRegistry,
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: LatencyInterceptor }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, TenantContextMiddleware).forRoutes("*")
  }
}
