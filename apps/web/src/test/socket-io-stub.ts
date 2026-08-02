import { vi } from "vitest"

type Listener = (payload: unknown) => void

const listeners = new Map<string, Set<Listener>>()

export const fakeSocket = {
  on: vi.fn((event: string, listener: Listener) => {
    const bucket = listeners.get(event) ?? new Set<Listener>()
    bucket.add(listener)
    listeners.set(event, bucket)
    return fakeSocket
  }),
  emit: vi.fn(),
  removeAllListeners: vi.fn(() => {
    listeners.clear()
    return fakeSocket
  }),
  disconnect: vi.fn(() => fakeSocket)
}

export const io = vi.fn(() => fakeSocket)

export const socketHandlerCount = (event: string): number => listeners.get(event)?.size ?? 0

export const fireSocketEvent = (event: string, payload?: unknown): void => {
  const bucket = listeners.get(event)
  if (!bucket || bucket.size === 0) {
    throw new Error(`no handler registered for socket event "${event}"`)
  }
  for (const listener of [...bucket]) listener(payload)
}

export const resetSocketMock = (): void => {
  listeners.clear()
  fakeSocket.on.mockClear()
  fakeSocket.emit.mockClear()
  fakeSocket.removeAllListeners.mockClear()
  fakeSocket.disconnect.mockClear()
  io.mockClear()
}
