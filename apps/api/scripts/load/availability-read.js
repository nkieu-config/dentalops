import http from "k6/http"
import { check } from "k6"

// Three connection audits capped pools that had been left at their defaults:
// Prisma to 5 (it was sizing itself from the host's cpu count), MongoDB to 10
// (it was on the driver default of 100). Smaller pools are right for a free
// tier, but a pool that is too small stops being thrift and starts being a
// queue. This holds a steady arrival rate against the read path to show which
// one it is.
//
// Local only. On the deployed free instance this would measure Render's cpu
// throttling instead.

const BASE = __ENV.BASE_URL || "http://localhost:3001"
const API = `${BASE}/api/v1`
const RATE = Number(__ENV.RATE || 40)

export const options = {
  scenarios: {
    steady_reads: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 20,
      maxVUs: 100
    }
  },
  thresholds: {
    http_req_failed: ["rate==0"],
    // A pool acting as a queue shows up as a tail far above the median.
    http_req_duration: ["p(50)<150", "p(95)<600", "p(99)<1200"]
  }
}

export function setup() {
  const login = http.post(`${API}/auth/demo-login`, JSON.stringify({ role: "owner" }), {
    headers: { "Content-Type": "application/json" }
  })
  if (login.status !== 200) throw new Error(`demo-login failed: ${login.status}`)
  const token = login.json("accessToken")

  const clinic = http.get(`${API}/public/demo-clinic`).json()
  return {
    token,
    branchId: clinic.branches[0].id,
    serviceId: clinic.services[0].id
  }
}

export default function (data) {
  const day = new Date(Date.now() + 24 * 3600_000)
  const from = new Date(day).toISOString()
  const to = new Date(day.getTime() + 24 * 3600_000).toISOString()

  const res = http.get(
    `${API}/availability?serviceId=${data.serviceId}&branchId=${data.branchId}&from=${from}&to=${to}`,
    {
      headers: { Authorization: `Bearer ${data.token}` },
      tags: { name: "availability" }
    }
  )

  check(res, {
    "answered": (r) => r.status === 200,
    "answered with slots": (r) => Array.isArray(r.json("slots"))
  })
}
