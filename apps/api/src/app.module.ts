import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common"
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core"
import { JwtModule } from "@nestjs/jwt"
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler"
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis"
import { SentryModule } from "@sentry/nestjs/setup"
import type Redis from "ioredis"
import { AppointmentsModule } from "./appointments/appointments.module"
import { AuditInterceptor } from "./audit/audit.interceptor"
import { AuditModule } from "./audit/audit.module"
import { DemoModule } from "./demo/demo.module"
import { AuthModule } from "./auth/auth.module"
import { AvailabilityModule } from "./availability/availability.module"
import { JwtAuthGuard } from "./auth/jwt-auth.guard"
import { RolesGuard } from "./auth/roles.guard"
import { AppExceptionFilter } from "./common/app-exception.filter"
import { LatencyController } from "./common/latency.controller"
import { LatencyInterceptor } from "./common/latency.interceptor"
import { LatencyRegistry } from "./common/latency.registry"
import { RequestIdMiddleware } from "./common/request-id.middleware"
import { ResilientThrottlerStorage } from "./common/resilient-throttler.storage"
import { DirectoryModule } from "./directory/directory.module"
import { HealthController } from "./health/health.controller"
import { PatientsModule } from "./patients/patients.module"
import { PrismaModule } from "./prisma/prisma.module"
import { ManageTokenMiddleware } from "./public/manage-token.middleware"
import { PublicModule } from "./public/public.module"
import { PublicTenantMiddleware } from "./public/public-tenant.middleware"
import { REDIS, RedisModule } from "./redis/redis.module"
import { RosterModule } from "./roster/roster.module"
import { ShiftsModule } from "./shifts/shifts.module"
import { StaffModule } from "./staff/staff.module"
import { TenantContextMiddleware } from "./tenant/tenant-context.middleware"

@Module({
  imports: [
    SentryModule.forRoot(),
    PrismaModule,
    RedisModule,
    AuditModule,
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      inject: [REDIS],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: "default", ttl: 60_000, limit: 60 }],
        storage: new ResilientThrottlerStorage(new ThrottlerStorageRedisService(redis))
      })
    }),
    AuthModule,
    ShiftsModule,
    RosterModule,
    AppointmentsModule,
    AvailabilityModule,
    PatientsModule,
    DirectoryModule,
    StaffModule,
    PublicModule,
    DemoModule
  ],
  controllers: [HealthController, LatencyController],
  providers: [
    LatencyRegistry,
    { provide: APP_FILTER, useClass: AppExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: LatencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, TenantContextMiddleware).forRoutes("*")
    consumer.apply(ManageTokenMiddleware).forRoutes("public/manage/:token")
    consumer.apply(PublicTenantMiddleware).forRoutes("public/:clinicSlug")
  }
}
