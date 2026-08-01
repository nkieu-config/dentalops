import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll } from "vitest"
import { setSession } from "./src/lib/session"
import { server } from "./src/test/msw"

class NoopResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class JsdomPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly pointerType: string

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 0
    this.pointerType = init.pointerType ?? "mouse"
  }
}

globalThis.ResizeObserver ??= NoopResizeObserver
globalThis.PointerEvent ??= JsdomPointerEvent as unknown as typeof PointerEvent
window.PointerEvent ??= globalThis.PointerEvent
Element.prototype.scrollTo ??= () => {}
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  setSession(null)
})

afterAll(() => {
  server.close()
})
