import {
  clientUrl,
  CONNECT_TIMEOUT_SECONDS,
  isPooled,
  POOL_LIMIT,
  poolingAdvice,
  withConnectTimeout,
  withPoolLimit
} from "../src/prisma/database-url"

const POOLED = "postgresql://u:p@ep-cool-name-123456-pooler.ap-southeast-1.aws.neon.tech/dentalops"
const DIRECT = "postgresql://u:p@ep-cool-name-123456.ap-southeast-1.aws.neon.tech/dentalops"
const LOCAL = "postgresql://dentalops:dentalops@localhost:5432/dentalops"

describe("the database url the client actually connects with", () => {
  it("caps the pool instead of letting prisma size it from the host's cpu count", () => {
    expect(withPoolLimit(LOCAL)).toBe(`${LOCAL}?connection_limit=${POOL_LIMIT}`)
    expect(withPoolLimit(`${POOLED}?sslmode=require`)).toBe(
      `${POOLED}?sslmode=require&connection_limit=${POOL_LIMIT}`
    )
  })

  it("leaves a limit the operator chose alone", () => {
    const chosen = `${LOCAL}?connection_limit=20`
    expect(withPoolLimit(chosen)).toBe(chosen)
  })

  it("waits longer than prisma's default for a neon compute to wake", () => {
    expect(CONNECT_TIMEOUT_SECONDS).toBeGreaterThan(5)
    expect(withConnectTimeout(LOCAL)).toBe(`${LOCAL}?connect_timeout=${CONNECT_TIMEOUT_SECONDS}`)
    expect(withConnectTimeout(`${POOLED}?connect_timeout=30`)).toBe(`${POOLED}?connect_timeout=30`)
  })

  it("carries both the cap and the wake budget in one url", () => {
    expect(clientUrl(POOLED)).toBe(
      `${POOLED}?connection_limit=${POOL_LIMIT}&connect_timeout=${CONNECT_TIMEOUT_SECONDS}`
    )
  })

  it("tells the pooled host from the direct one", () => {
    expect(isPooled(POOLED)).toBe(true)
    expect(isPooled(DIRECT)).toBe(false)
  })

  it("says so when the app would bypass the pooler", () => {
    expect(poolingAdvice(DIRECT, DIRECT)).toMatch(/-pooler host/)
  })

  it("says so when migrations would run through pgbouncer", () => {
    expect(poolingAdvice(POOLED, POOLED)).toMatch(/advisory locks/)
  })

  it("stays quiet when the pair is right, and off neon entirely", () => {
    expect(poolingAdvice(POOLED, DIRECT)).toBeNull()
    expect(poolingAdvice(LOCAL, LOCAL)).toBeNull()
    expect(poolingAdvice(undefined, undefined)).toBeNull()
  })
})
