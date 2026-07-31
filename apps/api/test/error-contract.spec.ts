import { Body, Controller, Get, INestApplication, Post, ValidationPipe } from "@nestjs/common"
import { APP_FILTER } from "@nestjs/core"
import { Test } from "@nestjs/testing"
import { IsInt, Min } from "class-validator"
import request from "supertest"
import { apiErrorSchema } from "@dentalops/contracts"
import { AppException } from "../src/common/app.exception"
import { AppExceptionFilter } from "../src/common/app-exception.filter"
import { RequestIdMiddleware } from "../src/common/request-id.middleware"

class DemoDto {
  @IsInt()
  @Min(1)
  quantity!: number
}

@Controller("boom")
class BoomController {
  @Get("app")
  app() {
    throw new AppException(409, "SLOT_TAKEN", "Someone got there first", { slot: "10:00" })
  }

  @Get("crash")
  crash() {
    throw new Error("unexpected")
  }

  @Post("validate")
  validate(@Body() dto: DemoDto) {
    return { ok: true, quantity: dto.quantity }
  }
}

describe("error contract", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BoomController],
      providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }]
    }).compile()
    app = moduleRef.createNestApplication()
    app.use(new RequestIdMiddleware().use.bind(new RequestIdMiddleware()))
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("formats AppException with its errorCode and details", async () => {
    const res = await request(app.getHttpServer()).get("/boom/app").expect(409)
    const parsed = apiErrorSchema.parse(res.body)
    expect(parsed.errorCode).toBe("SLOT_TAKEN")
    expect(parsed.details).toEqual({ slot: "10:00" })
    expect(res.headers["x-request-id"]).toBe(parsed.requestId)
  })

  it("formats validation failures as VALIDATION_ERROR", async () => {
    const res = await request(app.getHttpServer())
      .post("/boom/validate")
      .send({ quantity: 0 })
      .expect(400)
    const parsed = apiErrorSchema.parse(res.body)
    expect(parsed.errorCode).toBe("VALIDATION_ERROR")
  })

  it("hides unexpected errors behind INTERNAL", async () => {
    const res = await request(app.getHttpServer()).get("/boom/crash").expect(500)
    const parsed = apiErrorSchema.parse(res.body)
    expect(parsed.errorCode).toBe("INTERNAL")
    expect(parsed.message).not.toContain("unexpected")
  })
})
