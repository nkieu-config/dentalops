import { INestApplication, ValidationPipe } from "@nestjs/common"
import { Test, TestingModuleBuilder } from "@nestjs/testing"
import cookieParser from "cookie-parser"
import type { Server } from "node:http"
import { AppModule } from "../../src/app.module"

export interface TestApp {
  app: INestApplication
  server: Server
}

export const listen = async (app: INestApplication): Promise<Server> => {
  await app.listen(0, "127.0.0.1")
  return app.getHttpServer() as Server
}

export const createTestApp = async (
  builder: TestingModuleBuilder = Test.createTestingModule({ imports: [AppModule] }),
): Promise<TestApp> => {
  const moduleRef = await builder.compile()
  const app = moduleRef.createNestApplication({ forceCloseConnections: true })
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  return { app, server: await listen(app) }
}
