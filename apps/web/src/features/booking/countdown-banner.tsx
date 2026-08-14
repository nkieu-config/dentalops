import { AlarmClock, Timer, TimerOff } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { fmtTime } from "../timeline/lib/geometry"

export type CountdownUrgency = "normal" | "urgent" | "expired"

const URGENT_MS = 60_000

interface CountdownBannerProps {
  expiresAt: string
  startsAt: string
  onExpire: () => void
}

const remainingLabel = (remainingMs: number): string => {
  const total = Math.ceil(Math.max(0, remainingMs) / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`
}

const tone: Record<CountdownUrgency, { className: string; icon: LucideIcon }> = {
  normal: {
    className: "border-warning bg-warning-surface text-warning-on-surface",
    icon: Timer
  },
  urgent: {
    className: "border-destructive bg-destructive-surface text-destructive-on-surface font-semibold",
    icon: AlarmClock
  },
  expired: {
    className: "border-border bg-muted text-muted-foreground",
    icon: TimerOff
  }
}

export const CountdownBanner = ({ expiresAt, startsAt, onExpire }: CountdownBannerProps) => {
  const [now, setNow] = useState(() => Date.now())
  const expire = useRef(onExpire)

  useEffect(() => {
    expire.current = onExpire
  })

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  const remaining = Date.parse(expiresAt) - now
  const expired = remaining <= 0
  const urgency: CountdownUrgency = expired ? "expired" : remaining < URGENT_MS ? "urgent" : "normal"

  useEffect(() => {
    if (expired) expire.current()
  }, [expired])

  const [announcement, setAnnouncement] = useState("")
  const announcedFor = useRef<CountdownUrgency | null>(null)

  useEffect(() => {
    if (announcedFor.current === urgency) return
    announcedFor.current = urgency
    if (urgency === "urgent") setAnnouncement("Less than a minute left to confirm this booking.")
    else if (urgency === "expired") setAnnouncement("Your hold expired. Pick another time.")
    else setAnnouncement("")
  }, [urgency])

  const { className, icon: Icon } = tone[urgency]

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="hold-countdown"
        data-urgency={urgency}
        className={`flex items-center gap-2 rounded-card border px-3 py-2 type-body ${className}`}
      >
        <Icon className="h-5 w-5 shrink-0" aria-hidden />
        {expired ? (
          <span>Your hold expired</span>
        ) : (
          <span>
            Holding <span className="tabular-nums">{fmtTime(Date.parse(startsAt))}</span> for{" "}
            <strong className="tabular-nums">{remainingLabel(remaining)}</strong>
          </span>
        )}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  )
}
