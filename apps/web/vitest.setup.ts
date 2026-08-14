import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll } from "vitest"
import { setSession } from "./src/lib/session"
import { server } from "./src/test/msw"
import { resetNetwork } from "./src/test/network"
import { matchesViewport, resetViewport, subscribeViewport } from "./src/test/viewport"

class NoopResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class JsdomMediaQueryList extends EventTarget {
  readonly media: string
  onchange: ((event: MediaQueryListEvent) => unknown) | null = null
  #listeners = 0
  #unsubscribe: (() => void) | null = null

  constructor(media: string) {
    super()
    this.media = media
  }

  get matches(): boolean {
    return matchesViewport(this.media)
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void {
    super.addEventListener(type, listener, options)
    this.#listeners += 1
    this.#unsubscribe ??= subscribeViewport(() => this.dispatchEvent(new Event("change")))
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void {
    super.removeEventListener(type, listener, options)
    this.#listeners -= 1
    if (this.#listeners > 0) return
    this.#unsubscribe?.()
    this.#unsubscribe = null
  }

  addListener() {}
  removeListener() {}
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
window.scrollTo = () => {}
Element.prototype.setPointerCapture ??= () => {}
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}
window.matchMedia ??= ((query: string) =>
  new JsdomMediaQueryList(query) as unknown as MediaQueryList) as typeof window.matchMedia

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" })
})

afterEach(() => {
  resetNetwork()
  cleanup()
  server.resetHandlers()
  setSession(null)
  resetViewport()
})

afterAll(() => {
  server.close()
})
