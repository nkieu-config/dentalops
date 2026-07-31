import { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { healthResponseSchema } from "@dentalops/contracts"
import { AppModule } from "../src/app.module"

describe("GET /health", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("returns a payload matching the shared contract", async () => {
    const res = await request(app.getHttpServer()).get("/health").expect(200)
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true)
  })
})
