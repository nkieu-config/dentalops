import { ValidationPipe } from "@nestjs/common"
import type { NestExpressApplication } from "@nestjs/platform-express"
import cookieParser from "cookie-parser"

export const TRUSTED_PROXY_HOPS = 1

export const configureApp = (app: NestExpressApplication): void => {
  app.set("trust proxy", TRUSTED_PROXY_HOPS)
  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
}
