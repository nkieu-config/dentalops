import "./instrument"
import { ValidationPipe } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import cookieParser from "cookie-parser"
import { AppModule } from "./app.module"
import { requireSecret } from "./auth/token-secrets"
import { assertProductionEnv } from "./common/environment"

async function bootstrap() {
  requireSecret("JWT_SECRET")
  requireSecret("JWT_REFRESH_SECRET")
  assertProductionEnv()

  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix("api/v1")
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173", credentials: true })
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

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
