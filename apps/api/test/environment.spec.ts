import { assertProductionEnv, MisconfiguredEnvironment } from "../src/common/environment"

describe("what the api refuses to start without", () => {
  it("refuses production without WEB_ORIGIN, which would mail patients a localhost link", () => {
    expect(() => assertProductionEnv({ NODE_ENV: "production" })).toThrow(MisconfiguredEnvironment)
    expect(() => assertProductionEnv({ NODE_ENV: "production" })).toThrow(/localhost manage link/)
  })

  it("starts in production once it is set", () => {
    expect(() =>
      assertProductionEnv({ NODE_ENV: "production", WEB_ORIGIN: "https://trydentalops.vercel.app" })
    ).not.toThrow()
  })

  it("leaves development alone, where the localhost fallback is the right answer", () => {
    expect(() => assertProductionEnv({})).not.toThrow()
    expect(() => assertProductionEnv({ NODE_ENV: "test" })).not.toThrow()
  })
})
