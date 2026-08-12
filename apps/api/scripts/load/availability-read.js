import http from "k6/http"
import { check } from "k6"

const BASE = __ENV.BASE_URL || "http://localhost:3001"
const API = `${BASE}/api/v1`
const RATE = Number(__ENV.RATE || 40)
const DAY_MS = 86_400_000

const scenario = (startTime, exec, window) => ({
  executor: "constant-arrival-rate",
  rate: RATE,
  timeUnit: "1s",
  duration: "30s",
  preAllocatedVUs: 20,
  maxVUs: 100,
  startTime,
  exec,
  tags: { window }
})

export const options = {
  scenarios: {
    warm_reads: scenario("0s", "warmRead", "warm"),
    cold_reads: scenario("30s", "coldRead", "cold")
  },
  thresholds: {
    http_req_failed: ["rate==0"],
    "http_req_duration{window:warm}": ["p(50)<150", "p(95)<600", "p(99)<1200"],
    "http_req_duration{window:cold}": ["p(50)<150", "p(95)<600", "p(99)<1200"]
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

const read = (data, fromMs, window) => {
  const from = new Date(fromMs).toISOString()
  const to = new Date(fromMs + DAY_MS).toISOString()

  const res = http.get(
    `${API}/availability?serviceId=${data.serviceId}&branchId=${data.branchId}&from=${from}&to=${to}`,
    {
      headers: { Authorization: `Bearer ${data.token}` },
      tags: { name: "availability", window }
    }
  )

  check(res, {
    answered: (r) => r.status === 200,
    "answered with slots": (r) => Array.isArray(r.json("slots"))
  })
}

export function warmRead(data) {
  const tomorrow = Math.floor((Date.now() + DAY_MS) / DAY_MS) * DAY_MS
  read(data, tomorrow, "warm")
}

export function coldRead(data) {
  read(data, Date.now() + DAY_MS, "cold")
}
