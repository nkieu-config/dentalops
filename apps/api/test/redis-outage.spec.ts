import type { ThrottlerStorage } from "@nestjs/throttler"
import { createServer, type Server as TcpServer } from "node:net"
import {
  COMMAND_TIMEOUT_MS,
  createRedisClient,
  queueOptions,
  requestPathOptions
} from "../src/redis/redis-client"
import { ResilientThrottlerStorage } from "../src/common/resilient-throttler.storage"

const UNREACHABLE = "redis://127.0.0.1:6399"

describe("surviving a redis outage", () => {
  it("keeps serving when the rate limiter cannot reach redis", async () => {
    const failing: ThrottlerStorage = {
      increment: () => Promise.reject(new Error("max requests limit exceeded"))
    }
    const storage = new ResilientThrottlerStorage(failing)

    const record = await storage.increment("key", 60_000, 60, 0, "default")

    expect(record.isBlocked).toBe(false)
    expect(record.totalHits).toBe(1)
  })

  it("still counts locally, so an outage does not lift the limit entirely", async () => {
    const failing: ThrottlerStorage = {
      increment: () => Promise.reject(new Error("max requests limit exceeded"))
    }
    const storage = new ResilientThrottlerStorage(failing)

    const verdicts = []
    for (let i = 0; i < 5; i++) verdicts.push(await storage.increment("same", 60_000, 3, 0, "default"))

    expect(verdicts.slice(0, 3).every((v) => !v.isBlocked)).toBe(true)
    expect(verdicts.at(-1)!.isBlocked).toBe(true)
    expect((await storage.increment("other", 60_000, 3, 0, "default")).isBlocked).toBe(false)
  })

  it("enforces the limit again as soon as redis answers", async () => {
    let healthy = false
    const flaky: ThrottlerStorage = {
      increment: () =>
        healthy
          ? Promise.resolve({
              totalHits: 61,
              timeToExpire: 30,
              isBlocked: true,
              timeToBlockExpire: 30
            })
          : Promise.reject(new Error("max requests limit exceeded"))
    }
    const storage = new ResilientThrottlerStorage(flaky)

    expect((await storage.increment("k", 60_000, 60, 0, "default")).isBlocked).toBe(false)

    healthy = true
    expect((await storage.increment("k", 60_000, 60, 0, "default")).isBlocked).toBe(true)
  })

  it("gives every client an error listener, without which node throws and the process dies", async () => {
    const previous = process.env.REDIS_URL
    process.env.REDIS_URL = UNREACHABLE

    const client = createRedisClient("outage-test", {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null
    })

    expect(client.listenerCount("error")).toBeGreaterThan(0)

    const seen: Error[] = []
    client.on("error", (error: Error) => seen.push(error))
    await new Promise((resolve) => setTimeout(resolve, 400))

    client.disconnect()
    if (previous === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = previous

    expect(seen.length).toBeGreaterThan(0)
  })

  it("gives up on a redis that accepts the connection and then says nothing", async () => {
    const silent: TcpServer = createServer(() => undefined)
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve))
    const port = (silent.address() as { port: number }).port

    const previous = process.env.REDIS_URL
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`
    const client = createRedisClient("silent-test", requestPathOptions)

    const started = Date.now()
    await expect(client.get("anything")).rejects.toThrow()
    const elapsed = Date.now() - started

    expect(elapsed).toBeLessThan(COMMAND_TIMEOUT_MS * 4)

    client.disconnect()
    await new Promise<void>((resolve) => silent.close(() => resolve()))
    if (previous === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = previous
  })

  it("leaves the queue clients able to block, which is what BullMQ needs", () => {
    expect(requestPathOptions.commandTimeout).toBe(COMMAND_TIMEOUT_MS)
    expect(queueOptions.commandTimeout).toBeUndefined()
    expect(queueOptions.maxRetriesPerRequest).toBeNull()
  })
})
