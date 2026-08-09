import { delay, http, HttpResponse } from "msw"
import { setupServer } from "msw/node"

export const API = "http://localhost:3001/api/v1"

// Baseline fallback so a hold-release fired from an unmounting component (e.g. the booking
// wizard's cleanup effect) never races a per-test server.use() handler getting reset mid-flight.
// Tests that assert on the release request register their own handler, which takes priority.
const baseHandlers = [
  http.delete(`${API}/public/:clinicSlug/holds/:holdId`, () => new HttpResponse(null, { status: 204 }))
]

export const server = setupServer(...baseHandlers)
export { delay, http, HttpResponse }
