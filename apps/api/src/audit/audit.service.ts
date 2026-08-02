import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import * as Sentry from "@sentry/nestjs"
import { Collection, MongoClient, ObjectId } from "mongodb"
import { currentTenant } from "../tenant/tenant-context"
import { MONGO } from "./mongo.provider"

const COLLECTION = "audit_logs"
const RETENTION_SECONDS = 30 * 24 * 60 * 60

export interface AuditEntry {
  tenantId: string
  actor: { type: "staff" | "public"; id: string; name: string }
  action: string
  entity: { type: string; id: string }
  before?: unknown
  after?: unknown
  at: Date
  requestId: string
}

export interface AuditPage {
  entries: AuditEntry[]
  nextCursor: string | null
}

interface StoredEntry extends AuditEntry {
  _id: ObjectId
}

export const auditActor = (): AuditEntry["actor"] => {
  const tenant = currentTenant()
  return {
    type: tenant?.role === "public" ? "public" : "staff",
    id: tenant?.userId ?? "unknown",
    name: tenant?.name ?? "unknown"
  }
}

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(MONGO) private readonly client: MongoClient | null) {}

  get enabled(): boolean {
    return this.client !== null
  }

  private get collection(): Collection<StoredEntry> | null {
    return this.client ? this.client.db().collection<StoredEntry>(COLLECTION) : null
  }

  async onModuleInit() {
    const collection = this.collection
    if (!collection) return
    await collection.createIndex({ tenantId: 1, at: -1 })
    await collection.createIndex({ at: 1 }, { expireAfterSeconds: RETENTION_SECONDS })
  }

  async onModuleDestroy() {
    await this.client?.close()
  }

  record(entry: Omit<AuditEntry, "at">): void {
    const collection = this.collection
    if (!collection) return
    void collection
      .insertOne({ ...entry, at: new Date() } as StoredEntry)
      .catch((error: unknown) => Sentry.captureException(error))
  }

  async list(input: { cursor?: string; limit: number }): Promise<AuditPage> {
    const collection = this.collection
    const tenant = currentTenant()
    if (!collection || !tenant) return { entries: [], nextCursor: null }

    const filter: Record<string, unknown> = { tenantId: tenant.tenantId }
    if (input.cursor) filter._id = { $lt: new ObjectId(input.cursor) }

    const rows = await collection
      .find(filter)
      .sort({ _id: -1 })
      .limit(input.limit + 1)
      .toArray()

    const page = rows.slice(0, input.limit)
    const last = page.at(-1)
    return {
      entries: page.map(({ _id, ...rest }) => rest),
      nextCursor: rows.length > input.limit && last ? last._id.toHexString() : null
    }
  }

  async describeIndexes(): Promise<Array<{ expireAfterSeconds?: number }>> {
    const collection = this.collection
    if (!collection) return []
    return (await collection.indexes()) as Array<{ expireAfterSeconds?: number }>
  }
}
