import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  fakeSocket,
  fireSocketEvent,
  io,
  resetSocketMock,
  socketHandlerCount
} from "../test/socket-io-stub"
import { APPOINTMENT_CHANGED, SUBSCRIBE, useRealtime } from "./realtime"
import { setSession } from "./session"

vi.mock("socket.io-client", async () => await import("../test/socket-io-stub"))

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const otherBranchId = "8f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const appointmentId = "4f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const signIn = () =>
  setSession({
    accessToken: "access-token-1",
    user: {
      id: "7f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      tenantId: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      name: "Demo User",
      role: "receptionist"
    }
  })

const dayKey = (dayStart: number) => ["appointments", branchId, dayStart]

const mount = (initialDayStart = 1) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const setQueryData = vi.spyOn(client, "setQueryData")
  let served = 0
  const queryFn = vi.fn(() => {
    served += 1
    return Promise.resolve({ label: `v${served}` })
  })
  const changes: unknown[] = []

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)

  const view = renderHook(
    ({ dayStart }: { dayStart: number }) => {
      const query = useQuery({ queryKey: dayKey(dayStart), queryFn })
      useRealtime({
        branchId,
        queryKey: dayKey(dayStart),
        onChange: (event) => changes.push(event)
      })
      return query
    },
    { wrapper, initialProps: { dayStart: initialDayStart } }
  )

  return { client, queryFn, setQueryData, changes, view }
}

const connect = () => act(() => fireSocketEvent("connect"))

const changed = (payload: Record<string, unknown>) =>
  act(() => fireSocketEvent(APPOINTMENT_CHANGED, payload))

describe("useRealtime", () => {
  beforeEach(() => {
    resetSocketMock()
    signIn()
  })

  it("refetches the day from the server on a change event instead of trusting the payload", async () => {
    const harness = mount()
    await waitFor(() => expect(harness.view.result.current.data).toEqual({ label: "v1" }))
    connect()

    changed({
      appointmentId,
      branchId,
      action: "created",
      patient: { name: "Injected Patient" }
    })

    await waitFor(() => expect(harness.view.result.current.data).toEqual({ label: "v2" }))
    expect(harness.queryFn).toHaveBeenCalledTimes(2)
    expect(harness.setQueryData).not.toHaveBeenCalled()
    expect(JSON.stringify(harness.client.getQueryData(dayKey(1)))).not.toContain("Injected")
    expect(harness.changes).toEqual([{ appointmentId, branchId, action: "created" }])
  })

  it("ignores a change that belongs to another branch", async () => {
    const harness = mount()
    await waitFor(() => expect(harness.view.result.current.data).toEqual({ label: "v1" }))
    connect()

    changed({ appointmentId, branchId: otherBranchId, action: "created" })
    changed({ appointmentId, branchId, action: "created" })

    await waitFor(() => expect(harness.view.result.current.data).toEqual({ label: "v2" }))
    expect(harness.changes).toEqual([{ appointmentId, branchId, action: "created" }])
  })

  it("subscribes on every connect but only invalidates once the socket has come back", async () => {
    const harness = mount()
    await waitFor(() => expect(harness.view.result.current.data).toEqual({ label: "v1" }))

    connect()
    expect(harness.queryFn).toHaveBeenCalledTimes(1)
    expect(fakeSocket.emit).toHaveBeenCalledWith(SUBSCRIBE, { branchId })

    connect()

    await waitFor(() => expect(harness.queryFn).toHaveBeenCalledTimes(2))
    expect(fakeSocket.emit).toHaveBeenCalledTimes(2)
  })

  it("never opens a socket without a session", async () => {
    setSession(null)
    const harness = mount()
    await waitFor(() => expect(harness.view.result.current.data).toEqual({ label: "v1" }))

    expect(io).not.toHaveBeenCalled()
    expect(socketHandlerCount(APPOINTMENT_CHANGED)).toBe(0)
  })

  it("disconnects and drops its listeners on unmount", async () => {
    const harness = mount()
    await waitFor(() => expect(harness.view.result.current.data).toEqual({ label: "v1" }))
    expect(io).toHaveBeenCalledTimes(1)

    harness.view.unmount()

    expect(fakeSocket.removeAllListeners).toHaveBeenCalledTimes(1)
    expect(fakeSocket.disconnect).toHaveBeenCalledTimes(1)
    expect(socketHandlerCount(APPOINTMENT_CHANGED)).toBe(0)
  })

  it("follows the day the user moved to without reopening the socket", async () => {
    const harness = mount(1)
    await waitFor(() => expect(harness.view.result.current.data).toEqual({ label: "v1" }))

    harness.view.rerender({ dayStart: 2 })
    await waitFor(() => expect(harness.view.result.current.data).toEqual({ label: "v2" }))

    connect()
    changed({ appointmentId, branchId, action: "rescheduled" })

    await waitFor(() => expect(harness.client.getQueryData(dayKey(2))).toEqual({ label: "v3" }))
    expect(harness.client.getQueryData(dayKey(1))).toEqual({ label: "v1" })
    expect(io).toHaveBeenCalledTimes(1)
  })
})
