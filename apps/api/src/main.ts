import "./instrument"
import { NestFactory } from "@nestjs/core"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { AppModule } from "./app.module"
import { requireSecret } from "./auth/token-secrets"
import { configureApp } from "./common/configure-app"
import { assertProductionEnv } from "./common/environment"

async function bootstrap() {
  requireSecret("JWT_SECRET")
  requireSecret("JWT_REFRESH_SECRET")
  assertProductionEnv()

  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  app.setGlobalPrefix("api/v1")
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true })
  configureApp(app)

  const swaggerConfig = new DocumentBuilder()
    .setTitle("DentalOps API")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build()
  if (process.env.EXPOSE_API_DOCS === "true" || process.env.NODE_ENV !== "production") {
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swaggerConfig))
  }

  app.enableShutdownHooks()
  await app.listen(process.env.PORT ?? 3001)
}

void bootstrap()
