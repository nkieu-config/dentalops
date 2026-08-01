export const PX_PER_MIN = 16 / 15
export const DAY_MS = 86_400_000
const MINUTE = 60_000

export const bkkDayStart = (isoDate: string): number => Date.parse(`${isoDate}T00:00:00+07:00`)

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" })
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
})
const dayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric"
})

export const bkkToday = (): string => dateFmt.format(new Date())

export const bkkShiftDate = (isoDate: string, days: number): string =>
  dateFmt.format(new Date(bkkDayStart(isoDate) + days * DAY_MS + DAY_MS / 2))

export const msToY = (ms: number, dayStart: number): number =>
  ((ms - dayStart) / MINUTE) * PX_PER_MIN

export const yToMs = (y: number, dayStart: number): number =>
  dayStart + Math.round(y / PX_PER_MIN) * MINUTE

export const snapFloor = (ms: number, stepMin = 15): number =>
  Math.floor(ms / (stepMin * MINUTE)) * stepMin * MINUTE

export const snapCeil = (ms: number, stepMin = 15): number =>
  Math.ceil(ms / (stepMin * MINUTE)) * stepMin * MINUTE

export const fmtTime = (ms: number): string => timeFmt.format(new Date(ms))

export const fmtDay = (isoDate: string): string =>
  dayFmt.format(new Date(bkkDayStart(isoDate) + DAY_MS / 2))
