import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CountdownBanner } from "./countdown-banner"

const NOW = Date.parse("2026-08-03T03:00:00.000Z")
const startsAt = "2026-08-03T03:30:00.000Z"

const mountAt = (msFromNow: number) => {
  const onExpire = vi.fn()
  render(
    <CountdownBanner
      expiresAt={new Date(NOW + msFromNow).toISOString()}
      startsAt={startsAt}
      onExpire={onExpire}
    />
  )
  return { onExpire }
}

const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms))

describe("CountdownBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("counts from the server's expiresAt, not from a local five-minute timer", () => {
    mountAt(90_000)

    const banner = screen.getByTestId("hold-countdown")
    expect(banner).toHaveTextContent("Holding 10:30 for 1:30")
    expect(banner).not.toHaveTextContent("5:00")
  })

  it("ticks down once a second and turns urgent inside the last minute", () => {
    mountAt(90_000)
    expect(screen.getByTestId("hold-countdown")).toHaveAttribute("data-urgency", "normal")

    tick(1000)
    expect(screen.getByTestId("hold-countdown")).toHaveTextContent("1:29")

    tick(29_000)
    const banner = screen.getByTestId("hold-countdown")
    expect(banner).toHaveTextContent("1:00")
    expect(banner).toHaveAttribute("data-urgency", "normal")

    tick(1000)
    expect(screen.getByTestId("hold-countdown")).toHaveAttribute("data-urgency", "urgent")
  })

  it("announces expiry exactly once when the server's clock runs out", () => {
    const { onExpire } = mountAt(3000)
    expect(onExpire).not.toHaveBeenCalled()

    tick(3000)
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("hold-countdown")).toHaveTextContent("Your hold expired")
    expect(screen.getByTestId("hold-countdown")).toHaveAttribute("data-urgency", "expired")

    tick(5000)
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it("reports a hold that was already dead when it mounted", () => {
    const { onExpire } = mountAt(-1000)

    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("hold-countdown")).toHaveTextContent("Your hold expired")
  })

  it("keeps the remaining time in lining figures and at reading size", () => {
    mountAt(240_000)

    const banner = screen.getByTestId("hold-countdown")
    expect(banner.className).toContain("text-base")
    expect(screen.getByText("4:00").className).toContain("tabular-nums")
  })
})
