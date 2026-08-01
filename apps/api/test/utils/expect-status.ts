import type { Response } from "supertest"

export const expectStatus = (res: Response, expected: number): Response => {
  if (res.status !== expected) {
    const body = JSON.stringify(res.body)
    const detail = body === "{}" ? JSON.stringify(res.text?.slice(0, 200)) : body
    throw new Error(`expected HTTP ${expected} but got ${res.status}: ${detail}`)
  }
  return res
}
