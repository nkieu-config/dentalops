import { INestApplication, ValidationPipe } from "@nestjs/common"
import { Test, TestingModuleBuilder } from "@nestjs/testing"
import cookieParser from "cookie-parser"
import type Redis from "ioredis"
import type { Server } from "node:http"
import { AppModule } from "../../src/app.module"
import { REDIS } from "../../src/redis/redis.module"

const THROTTLER_KEYS = "*:default}:*"

export interface TestApp {
  app: INestApplication
  server: Server
}

export const listen = async (app: INestApplication): Promise<Server> => {
  await app.listen(0, "127.0.0.1")
  return app.getHttpServer() as Server
}

const clearThrottlerState = async (app: INestApplication): Promise<void> => {
  try {
    const redis = app.get<Redis>(REDIS)
    const keys = await redis.keys(THROTTLER_KEYS)
    if (keys.length > 0) await redis.del(...keys)
  } catch {
    return
  }
}

export const createTestApp = async (
  builder: TestingModuleBuilder = Test.createTestingModule({ imports: [AppModule] }),
  options: { globalPrefix?: string } = {}
): Promise<TestApp> => {
  const moduleRef = await builder.compile()
  const app = moduleRef.createNestApplication({ forceCloseConnections: true })
  if (options.globalPrefix) app.setGlobalPrefix(options.globalPrefix)
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  const server = await listen(app)
  await clearThrottlerState(app)
  return { app, server }
}
