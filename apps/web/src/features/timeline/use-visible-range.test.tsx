import { fireEvent, render, screen } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useVisibleRange } from "./use-visible-range"

const Harness = () => {
  const ref = useRef<HTMLDivElement>(null)
  const range = useVisibleRange(ref)
  return (
    <div ref={ref} data-testid="scroller">
      <output>{`${range.top}:${range.bottom}`}</output>
    </div>
  )
}

describe("useVisibleRange", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(performance.now())
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("derives the padded window from scrollTop and clientHeight", async () => {
    render(<Harness />)
    const el = screen.getByTestId("scroller")
    Object.defineProperty(el, "clientHeight", { value: 800, configurable: true })
    Object.defineProperty(el, "scrollTop", { value: 500, writable: true })
    fireEvent.scroll(el)
    expect(await screen.findByText("300:1500")).toBeInTheDocument()
  })

  it("falls back to a default viewport height when layout is unmeasured", () => {
    render(<Harness />)
    expect(screen.getByText("-200:1800")).toBeInTheDocument()
  })
})
