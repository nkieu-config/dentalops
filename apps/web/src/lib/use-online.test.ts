import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { goOffline, goOnline, setOnLine } from "../test/network"
import { useOnline } from "./use-online"

describe("useOnline", () => {
  it("starts from whatever the browser already reports", () => {
    setOnLine(false)
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(false)
  })

  it("flips to false when the browser goes offline and back when it returns", () => {
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)

    goOffline()
    expect(result.current).toBe(false)

    goOnline()
    expect(result.current).toBe(true)
  })

  it("removes both listeners on unmount so repeated mounts cannot leak", () => {
    const add = vi.spyOn(window, "addEventListener")
    const remove = vi.spyOn(window, "removeEventListener")

    const { unmount } = renderHook(() => useOnline())
    const added = add.mock.calls.filter(([type]) => type === "online" || type === "offline")
    expect(added).toHaveLength(2)

    unmount()
    const removed = remove.mock.calls.filter(([type]) => type === "online" || type === "offline")
    expect(removed.map(([type, listener]) => [type, listener])).toEqual(
      added.map(([type, listener]) => [type, listener])
    )

    add.mockRestore()
    remove.mockRestore()
  })

  it("stops responding to events once unmounted", () => {
    const { result, unmount } = renderHook(() => useOnline())
    unmount()

    goOffline()
    expect(result.current).toBe(true)
  })
})
