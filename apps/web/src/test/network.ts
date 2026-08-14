import { act } from "@testing-library/react"

export const setOnLine = (value: boolean): void => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value })
}

const announceOnline = (): void => {
  setOnLine(true)
  window.dispatchEvent(new Event("online"))
}

export const resetNetwork = (): void => announceOnline()

export const goOffline = (): void => {
  act(() => {
    setOnLine(false)
    window.dispatchEvent(new Event("offline"))
  })
}

export const goOnline = (): void => {
  act(announceOnline)
}
