import { act } from "@testing-library/react"

export const setOnLine = (value: boolean): void => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value })
}

export const resetNetwork = (): void => setOnLine(true)

export const goOffline = (): void => {
  act(() => {
    setOnLine(false)
    window.dispatchEvent(new Event("offline"))
  })
}

export const goOnline = (): void => {
  act(() => {
    setOnLine(true)
    window.dispatchEvent(new Event("online"))
  })
}
