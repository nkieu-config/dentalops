import type {
  Appointment,
  Branch,
  PatientPage,
  RosterValidation,
  ServiceSummary,
  Shift,
  StaffMember
} from "@dentalops/contracts"
import type { APIRequestContext } from "@playwright/test"

const API_ORIGIN = `http://localhost:${process.env.E2E_API_PORT ?? 3001}`

const bkkDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" })
const bkkWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", weekday: "short" })
const bkkDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric"
})
const bkkClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
})

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

export const apiUrl = (path: string): string => `${API_ORIGIN}/api/v1${path}`

export const pinnedNow = (): number => {
  const pinned = process.env.E2E_NOW
  if (!pinned) return Date.now()
  const parsed = Date.parse(pinned)
  if (Number.isNaN(parsed)) throw new Error(`E2E_NOW is not a date this runtime can parse: ${pinned}`)
  return parsed
}

export const demoLogin = async (request: APIRequestContext): Promise<string> => {
  const res = await request.post(apiUrl("/auth/demo-login"), { data: { role: "owner" } })
  if (!res.ok()) throw new Error(`demo-login failed ${res.status()}: ${await res.text()}`)
  const body = (await res.json()) as { accessToken: string }
  return body.accessToken
}

export const getJson = async <T>(
  request: APIRequestContext,
  token: string,
  path: string
): Promise<T> => {
  const res = await request.get(apiUrl(path), { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok()) throw new Error(`GET ${path} failed ${res.status()}: ${await res.text()}`)
  return (await res.json()) as T
}

export const postJson = async <T>(
  request: APIRequestContext,
  token: string,
  path: string,
  body: unknown
): Promise<T> => {
  const res = await request.post(apiUrl(path), {
    headers: { authorization: `Bearer ${token}` },
    data: body
  })
  if (!res.ok()) throw new Error(`POST ${path} failed ${res.status()}: ${await res.text()}`)
  return (await res.json()) as T
}

export const patchJson = async <T>(
  request: APIRequestContext,
  token: string,
  path: string,
  body: unknown
): Promise<T> => {
  const res = await request.patch(apiUrl(path), {
    headers: { authorization: `Bearer ${token}` },
    data: body
  })
  if (!res.ok()) throw new Error(`PATCH ${path} failed ${res.status()}: ${await res.text()}`)
  return (await res.json()) as T
}

export const dayWindow = (date: string): string => {
  const from = new Date(Date.parse(`${date}T00:00:00+07:00`)).toISOString()
  const to = new Date(Date.parse(from) + DAY_MS).toISOString()
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
}

export const nextMonday = (now = Date.now()): string => {
  for (let days = 1; days <= 7; days += 1) {
    const candidate = new Date(now + days * DAY_MS)
    if (bkkWeekday.format(candidate) === "Mon") return bkkDate.format(candidate)
  }
  throw new Error("no Monday in the next seven days")
}

export const recentWeekday = (weeksAgo = 2, now = Date.now()): string => {
  for (let days = weeksAgo * 7; days <= weeksAgo * 7 + 7; days += 1) {
    const candidate = new Date(now - days * DAY_MS)
    if (bkkWeekday.format(candidate) === "Mon") return bkkDate.format(candidate)
  }
  throw new Error("no Monday in the target week")
}

export const bkkDayLabel = (date: string): string =>
  bkkDay.format(new Date(Date.parse(`${date}T00:00:00+07:00`) + DAY_MS / 2))

export const bkkClockLabel = (ms: number): string => bkkClock.format(new Date(ms))

export const dayAfter = (date: string, days: number): string =>
  bkkDate.format(new Date(Date.parse(`${date}T00:00:00+07:00`) + days * DAY_MS + DAY_MS / 2))

export const findFreeDentist = async (
  request: APIRequestContext,
  token: string,
  date: string
): Promise<StaffMember> => {
  const dentists = await getJson<StaffMember[]>(request, token, "/staff?role=dentist")
  const shifts = await getJson<Shift[]>(request, token, `/shifts?${dayWindow(date)}`)
  const onShift = new Set(shifts.map((s) => s.staffId))
  const free = dentists.find((d) => d.isActive && !onShift.has(d.id))
  if (!free) {
    throw new Error(
      `every dentist is rostered on ${date}: ${dentists.map((d) => d.name).join(", ")}`
    )
  }
  return free
}

export interface RosteredDentist {
  dentist: StaffMember
  branch: Branch
  shift: Shift
}

export const findRosteredDentist = async (
  request: APIRequestContext,
  token: string,
  date: string,
  options: { excludeBranchId?: string } = {}
): Promise<RosteredDentist> => {
  const [dentists, shifts, branches] = await Promise.all([
    getJson<StaffMember[]>(request, token, "/staff?role=dentist"),
    getJson<Shift[]>(request, token, `/shifts?${dayWindow(date)}`),
    getJson<Branch[]>(request, token, "/branches")
  ])
  for (const dentist of dentists) {
    if (!dentist.isActive) continue
    const shift = shifts.find(
      (s) => s.staffId === dentist.id && s.branchId !== options.excludeBranchId
    )
    const branch = branches.find((b) => b.id === shift?.branchId)
    if (shift && branch) return { dentist, branch, shift }
  }
  throw new Error(`no dentist is rostered on ${date}: ${dentists.map((d) => d.name).join(", ")}`)
}

export const weekWindow = (weekStart: string): { from: string; to: string } => {
  const from = new Date(Date.parse(`${weekStart}T00:00:00+07:00`)).toISOString()
  return { from, to: new Date(Date.parse(from) + 7 * DAY_MS).toISOString() }
}

export const clearRosterViolations = async (
  request: APIRequestContext,
  token: string,
  branchId: string,
  weekStart: string
): Promise<void> => {
  const { violations } = await postJson<RosterValidation>(request, token, "/roster/validate", {
    branchId,
    ...weekWindow(weekStart),
    draftShifts: []
  })
  const stranded = new Set(
    violations.filter((v) => v.severity === "block").flatMap((v) => v.appointmentIds ?? [])
  )
  for (const id of stranded) {
    await patchJson(request, token, `/appointments/${id}/status`, { status: "cancelled" })
  }
}

export const clearColumn = async (
  request: APIRequestContext,
  token: string,
  dentistId: string,
  date: string
): Promise<void> => {
  const existing = await getJson<Appointment[]>(
    request,
    token,
    `/appointments?dentistId=${dentistId}&${dayWindow(date)}`
  )
  for (const appointment of existing) {
    if (appointment.status !== "confirmed") continue
    await patchJson(request, token, `/appointments/${appointment.id}/status`, {
      status: "cancelled"
    })
  }
}

export const findSixtyMinuteService = async (
  request: APIRequestContext,
  token: string
): Promise<ServiceSummary> => {
  const services = await getJson<ServiceSummary[]>(request, token, "/services")
  const service = services.find((s) => s.isActive && s.durationMin === 60)
  if (!service) throw new Error("no active 60-minute service in the demo tenant")
  return service
}

export const firstBranch = async (request: APIRequestContext, token: string): Promise<Branch> => {
  const branches = await getJson<Branch[]>(request, token, "/branches")
  const branch = branches[0]
  if (!branch) throw new Error("the demo tenant has no branches")
  return branch
}

export const branchWithSpareChair = async (
  request: APIRequestContext,
  token: string,
  date: string,
  fromHour: number,
  toHour: number
): Promise<Branch> => {
  const dayStart = Date.parse(`${date}T00:00:00+07:00`)
  const from = dayStart + fromHour * HOUR_MS
  const to = dayStart + toHour * HOUR_MS
  const [branches, chairs, shifts] = await Promise.all([
    getJson<Branch[]>(request, token, "/branches"),
    getJson<{ branchId: string }[]>(request, token, "/resources?type=chair"),
    getJson<Shift[]>(request, token, `/shifts?${dayWindow(date)}`)
  ])
  const spare = branches.find((branch) => {
    const rostered = shifts.filter(
      (s) => s.branchId === branch.id && Date.parse(s.startsAt) < to && Date.parse(s.endsAt) > from
    )
    return rostered.length < chairs.filter((chair) => chair.branchId === branch.id).length
  })
  if (!spare) {
    throw new Error(
      `every branch runs every chair on ${date} between ${fromHour}:00 and ${toHour}:00, so a reschedule has nowhere to land`
    )
  }
  return spare
}

export const firstPatient = async (request: APIRequestContext, token: string) => {
  const page = await getJson<PatientPage>(request, token, "/patients?limit=1")
  const patient = page.items[0]
  if (!patient) throw new Error("the demo tenant has no patients")
  return patient
}
