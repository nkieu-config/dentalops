import {
  REDACTED,
  scrubEvent,
  scrubValue,
  type ScrubbableEvent
} from "../src/common/sentry-scrub"

describe("sentry scrubbing", () => {
  it("removes the request body outright, because every booking body carries a patient", () => {
    const event = scrubEvent({
      request: {
        data: { name: "Somchai Wattana", phone: "0812345678", startsAt: "2027-01-01T02:00:00Z" }
      }
    })
    expect(event.request!.data).toBe(REDACTED)
    expect(JSON.stringify(event)).not.toContain("Somchai")
    expect(JSON.stringify(event)).not.toContain("0812345678")
  })

  it("redacts credentials in headers but keeps the harmless ones", () => {
    const event = scrubEvent({
      request: {
        headers: {
          authorization: "Bearer secret.jwt.value",
          cookie: "dentalops_refresh=abc",
          "content-type": "application/json",
          "x-request-id": "req-1"
        }
      }
    })
    const headers = event.request!.headers as Record<string, unknown>
    expect(headers.authorization).toBe(REDACTED)
    expect(headers.cookie).toBe(REDACTED)
    expect(headers["content-type"]).toBe("application/json")
    expect(headers["x-request-id"]).toBe("req-1")
  })

  it("drops the query string, which carries manage tokens and patient searches", () => {
    const event = scrubEvent({
      request: { url: "https://api.example/api/v1/patients?q=Somchai", query_string: "q=Somchai" }
    })
    expect(event.request!.url).toBe("https://api.example/api/v1/patients")
    expect(event.request!.query_string).toBe(REDACTED)
    expect(JSON.stringify(event)).not.toContain("Somchai")
  })

  it("scrubs nested user and extra payloads without destroying their shape", () => {
    const event = scrubEvent({
      user: { id: "u1", name: "Malee Suksan", email: "malee@example.com" },
      extra: { appointment: { id: "a1", patient: { name: "Ploy", phone: "0800000000" } } }
    })
    const user = event.user as Record<string, unknown>
    expect(user.id).toBe("u1")
    expect(user.name).toBe(REDACTED)
    expect(user.email).toBe(REDACTED)

    const extra = event.extra as { appointment: { id: string; patient: Record<string, unknown> } }
    expect(extra.appointment.id).toBe("a1")
    expect(extra.appointment.patient.name).toBe(REDACTED)
    expect(extra.appointment.patient.phone).toBe(REDACTED)
  })

  it("leaves an event with nothing sensitive completely alone", () => {
    const input: ScrubbableEvent = { request: { url: "https://api.example/api/v1/health" } }
    const event = scrubEvent(input)
    expect(event.request!.url).toBe("https://api.example/api/v1/health")
    expect(event.request!.data).toBeUndefined()
  })

  it("does not recurse forever on a deeply nested payload", () => {
    let deep: Record<string, unknown> = { name: "leaf" }
    for (let i = 0; i < 20; i++) deep = { nested: deep }
    expect(() => scrubValue(deep)).not.toThrow()
  })
})
