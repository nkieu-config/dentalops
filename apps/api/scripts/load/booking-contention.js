import http from "k6/http"
import { check } from "k6"
import { Counter } from "k6/metrics"

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
    appointments_created: ["count>0", "count<2"],
    unexpected_status: ["count==0"],
    http_req_failed: ["rate==0"],
    http_req_duration: ["p(95)<2000"]
  }
}

const SEARCH_HORIZON_DAYS = 21

const firstSlotOnADayThatStillHasOne = ({ auth, branchId, serviceId }) => {
  for (let day = 2; day <= SEARCH_HORIZON_DAYS; day++) {
    const from = new Date(Date.now() + day * 24 * 3600_000).toISOString()
    const to = new Date(Date.now() + (day + 1) * 24 * 3600_000).toISOString()
    const slots = http
      .get(`${API}/availability?serviceId=${serviceId}&branchId=${branchId}&from=${from}&to=${to}`, auth)
      .json("slots")
    if (slots && slots.length > 0) return slots[0]
  }
  throw new Error(
    `every day for the next ${SEARCH_HORIZON_DAYS} is fully booked; reseed the demo tenant`
  )
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

  const target = firstSlotOnADayThatStillHasOne({ auth, branchId, serviceId })
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
