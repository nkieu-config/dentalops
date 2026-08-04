import http from "k6/http"
import { check } from "k6"
import { Counter } from "k6/metrics"

// The project's headline claim is that a double-booking is unrepresentable
// rather than unlikely. appointments.spec.ts proves it with 20 concurrent
// requests inside one process; this drives it from outside, over HTTP, with
// every virtual user racing for the same slot at once.
//
// Point it at a local stack, never at the free-tier deployment: Render gives
// the API a tenth of a CPU, so a load test there measures the host's
// throttling rather than the application's behaviour.

const BASE = __ENV.BASE_URL || "http://localhost:3001"
const API = `${BASE}/api/v1`
const RACERS = Number(__ENV.RACERS || 60)

const created = new Counter("appointments_created")
const conflicts = new Counter("slot_conflicts")
const unexpected = new Counter("unexpected_status")

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409))

export const options = {
  scenarios: {
    one_slot_many_patients: {
      executor: "per-vu-iterations",
      vus: RACERS,
      iterations: 1,
      maxDuration: "1m"
    }
  },
  thresholds: {
    // The whole point: the database lets exactly one of them through.
    appointments_created: ["count>0", "count<2"],
    unexpected_status: ["count==0"],
    http_req_failed: ["rate==0"],
    http_req_duration: ["p(95)<2000"]
  }
}

export function setup() {
  const login = http.post(`${API}/auth/demo-login`, JSON.stringify({ role: "owner" }), {
    headers: { "Content-Type": "application/json" }
  })
  if (login.status !== 200) throw new Error(`demo-login failed: ${login.status} ${login.body}`)
  const token = login.json("accessToken")
  const auth = { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }

  const clinic = http.get(`${API}/public/demo-clinic`).json()
  const branchId = clinic.branches[0].id
  const serviceId = clinic.services[0].id

  const patients = http.get(`${API}/patients?limit=1`, auth).json()
  const patientId = patients.items[0].id

  // Each run books one of the demo tenant's free slots, so a fixed window
  // empties out after a few runs and the script stops being repeatable. Walk
  // forward until a day still has something free.
  let target = null
  for (let day = 2; day <= 21 && !target; day++) {
    const from = new Date(Date.now() + day * 24 * 3600_000).toISOString()
    const to = new Date(Date.now() + (day + 1) * 24 * 3600_000).toISOString()
    const slots = http
      .get(`${API}/availability?serviceId=${serviceId}&branchId=${branchId}&from=${from}&to=${to}`, auth)
      .json("slots")
    if (slots && slots.length > 0) target = slots[0]
  }
  if (!target) throw new Error("no free slot in the next three weeks; reseed the demo tenant")
  return { token, branchId, serviceId, patientId, startsAt: target.startsAt, dentistId: target.dentistId }
}

export default function (data) {
  const res = http.post(
    `${API}/appointments`,
    JSON.stringify({
      branchId: data.branchId,
      serviceId: data.serviceId,
      dentistId: data.dentistId,
      patientId: data.patientId,
      startsAt: data.startsAt
    }),
    {
      headers: { Authorization: `Bearer ${data.token}`, "Content-Type": "application/json" },
      tags: { name: "book-contended-slot" }
    }
  )

  if (res.status === 201) created.add(1)
  else if (res.status === 409) conflicts.add(1)
  else unexpected.add(1)

  check(res, {
    "won the slot or was told it was taken": (r) => r.status === 201 || r.status === 409,
    "a refusal names the conflict": (r) => r.status !== 409 || r.json("errorCode") !== undefined
  })
}
