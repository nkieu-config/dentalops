import { INestApplication } from "@nestjs/common"
import type Redis from "ioredis"
import type { Server } from "node:http"
import request from "supertest"
import { REDIS } from "../src/redis/redis.module"
import { createTestApp } from "./utils/test-app"

const THROTTLER_KEY_PATTERN = "*:default}:*"
const CREDENTIAL_LIMIT = 10

describe("rate limiting counts the client, not the proxy", () => {
  let app: INestApplication
  let server: Server
  let redis: Redis

  const clearThrottleState = async () => {
    const keys = await redis.keys(THROTTLER_KEY_PATTERN)
    if (keys.length > 0) await redis.del(...keys)
  }

  const failedLogin = (forwardedFor: string) =>
    request(server)
      .post("/auth/login")
      .set("X-Forwarded-For", forwardedFor)
      .send({ clinicSlug: "demo-clinic", email: "nobody@example.com", password: "wrong" })

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
    redis = app.get<Redis>(REDIS)
  })

  beforeEach(clearThrottleState)

  afterAll(async () => {
    await clearThrottleState()
    await app.close()
  })

  it("gives each forwarded client its own budget", async () => {
    const attempts = CREDENTIAL_LIMIT + 5
    const statuses: number[] = []
    for (let i = 0; i < attempts; i++) {
      statuses.push((await failedLogin(`203.0.113.${i + 1}`)).status)
    }
    expect(statuses.filter((status) => status === 429)).toHaveLength(0)
  })

  it("still stops one client that keeps guessing", async () => {
    const attempts = CREDENTIAL_LIMIT + 5
    const statuses: number[] = []
    for (let i = 0; i < attempts; i++) {
      statuses.push((await failedLogin("203.0.113.200")).status)
    }
    expect(statuses.filter((status) => status === 429)).toHaveLength(attempts - CREDENTIAL_LIMIT)
  })
})
