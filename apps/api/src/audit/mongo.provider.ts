import { Logger, Provider } from "@nestjs/common"
import * as Sentry from "@sentry/nestjs"
import { MongoClient } from "mongodb"

export const MONGO = Symbol("MONGO")

export const DEFAULT_AUDIT_DB = "dentalops"

export interface MongoConnection {
  client: MongoClient
  dbName: string
}

const logger = new Logger("MongoProvider")

export const databaseFromUrl = (url: string): string => {
  const path = url.split("?")[0]?.split("/").at(3) ?? ""
  return decodeURIComponent(path) || DEFAULT_AUDIT_DB
}

export const mongoProvider: Provider = {
  provide: MONGO,
  useFactory: async (): Promise<MongoConnection | null> => {
    const url = process.env.MONGODB_URL
    if (!url) return null
    const client = new MongoClient(url, {
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 10_000,
      socketTimeoutMS: 20_000,
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000
    })
    try {
      await client.connect()
      return { client, dbName: databaseFromUrl(url) }
    } catch (error) {
      Sentry.captureException(error)
      logger.warn(
        "audit log unavailable: mongo did not accept a connection — the underlying error is in Sentry"
      )
      await client.close().catch(() => undefined)
      return null
    }
  }
}
