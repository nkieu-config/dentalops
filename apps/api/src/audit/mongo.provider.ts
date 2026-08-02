import { Logger, Provider } from "@nestjs/common"
import * as Sentry from "@sentry/nestjs"
import { MongoClient } from "mongodb"

export const MONGO = Symbol("MONGO")

const logger = new Logger("MongoProvider")

export const mongoProvider: Provider = {
  provide: MONGO,
  useFactory: async (): Promise<MongoClient | null> => {
    const url = process.env.MONGODB_URL
    if (!url) return null
    const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 })
    try {
      await client.connect()
      return client
    } catch (error) {
      Sentry.captureException(error)
      logger.warn("audit log unavailable: mongo did not accept a connection")
      await client.close().catch(() => undefined)
      return null
    }
  }
}
