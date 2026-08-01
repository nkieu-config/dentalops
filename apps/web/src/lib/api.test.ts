import { describe, expect, it } from "vitest"
import { z } from "zod"
import { API, HttpResponse, delay, http, server } from "../test/msw"
import { ApiError, api } from "./api"
import { setSession } from "./session"

const fakeSession = {
  accessToken: "t1",
  user: {
    id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    tenantId: "6f9619ff-8b86-4d01-b42d-00cf4fc964fe",
    name: "Owner",
    role: "owner" as const
  }
}

const unauthorized = () =>
  HttpResponse.json(
    { statusCode: 401, errorCode: "UNAUTHORIZED", message: "no", requestId: "r" },
    { status: 401 }
  )

const okSchema = z.object({ ok: z.boolean() })

describe("api client", () => {
  it("refreshes once on 401 and retries with the new token", async () => {
    setSession(fakeSession)
    const seen: string[] = []
    server.use(
      http.get(`${API}/ping`, ({ request }) => {
        const auth = request.headers.get("authorization") ?? ""
        seen.push(auth)
        if (auth === "Bearer t2") return HttpResponse.json({ ok: true })
        return unauthorized()
      }),
      http.post(`${API}/auth/refresh`, () => HttpResponse.json({ ...fakeSession, accessToken: "t2" }))
    )
    const result = await api("/ping", okSchema)
    expect(result.ok).toBe(true)
    expect(seen).toEqual(["Bearer t1", "Bearer t2"])
  })

  it("retries the original request exactly once when the refreshed token still fails", async () => {
    setSession(fakeSession)
    let attempts = 0
    let refreshCalls = 0
    server.use(
      http.get(`${API}/still-401`, () => {
        attempts++
        return unauthorized()
      }),
      http.post(`${API}/auth/refresh`, () => {
        refreshCalls++
        return HttpResponse.json({ ...fakeSession, accessToken: "t2" })
      })
    )
    await expect(api("/still-401", okSchema)).rejects.toBeInstanceOf(ApiError)
    expect(attempts).toBe(2)
    expect(refreshCalls).toBe(1)
  })

  it("shares a single in-flight refresh across concurrent 401s", async () => {
    setSession(fakeSession)
    let refreshCalls = 0
    server.use(
      http.get(`${API}/concurrent`, ({ request }) =>
        request.headers.get("authorization") === "Bearer t2"
          ? HttpResponse.json({ ok: true })
          : unauthorized()
      ),
      http.post(`${API}/auth/refresh`, async () => {
        refreshCalls++
        await delay(30)
        return HttpResponse.json({ ...fakeSession, accessToken: "t2" })
      })
    )
    const results = await Promise.all([
      api("/concurrent", okSchema),
      api("/concurrent", okSchema),
      api("/concurrent", okSchema)
    ])
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    expect(refreshCalls).toBe(1)
  })

  it("does not attempt refresh for anonymous requests", async () => {
    let refreshCalls = 0
    server.use(
      http.get(`${API}/anon`, () => unauthorized()),
      http.post(`${API}/auth/refresh`, () => {
        refreshCalls++
        return HttpResponse.json(fakeSession)
      })
    )
    await expect(api("/anon", z.unknown())).rejects.toBeInstanceOf(ApiError)
    expect(refreshCalls).toBe(0)
  })

  it("throws a typed ApiError carrying the errorCode", async () => {
    server.use(
      http.get(`${API}/boom`, () =>
        HttpResponse.json(
          { statusCode: 409, errorCode: "SLOT_CONFLICT", message: "taken", requestId: "r" },
          { status: 409 }
        )
      )
    )
    const err = await api("/boom", z.unknown()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).errorCode).toBe("SLOT_CONFLICT")
    expect((err as ApiError).status).toBe(409)
  })

  it("sends the query string and a json body with the right headers", async () => {
    let seenUrl = ""
    let seenContentType: string | null = null
    let seenBody: unknown = null
    server.use(
      http.post(`${API}/echo`, async ({ request }) => {
        seenUrl = request.url
        seenContentType = request.headers.get("content-type")
        seenBody = await request.json()
        return HttpResponse.json({ ok: true })
      })
    )
    await api("/echo", okSchema, {
      method: "POST",
      body: { role: "owner" },
      query: { branchId: "b1", missing: undefined }
    })
    expect(seenUrl).toBe(`${API}/echo?branchId=b1`)
    expect(seenContentType).toBe("application/json")
    expect(seenBody).toEqual({ role: "owner" })
  })
})
