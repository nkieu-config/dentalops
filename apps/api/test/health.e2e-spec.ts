import { INestApplication } from "@nestjs/common"
import request from "supertest"
import type { Server } from "node:http"
import { healthResponseSchema } from "@dentalops/contracts"
import { createTestApp } from "./utils/test-app"

describe("GET /health", () => {
  let app: INestApplication
  let server: Server

  beforeAll(async () => {
    ;({ app, server } = await createTestApp())
  })

  afterAll(async () => {
    await app.close()
  })

  it("returns a payload matching the shared contract", async () => {
    const res = await request(server).get("/health").expect(200)
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true)
  })
})
