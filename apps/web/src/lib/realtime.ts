import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { io } from "socket.io-client"
import { z } from "zod"
import { useSession } from "./session"

const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3001"

export const REALTIME_NAMESPACE = "/realtime"
export const APPOINTMENT_CHANGED = "appointment.changed"
export const SUBSCRIBE = "subscribe"

export const appointmentChangedSchema = z.object({
  appointmentId: z.string(),
  branchId: z.string(),
  action: z.enum(["created", "rescheduled", "status"])
})

export type AppointmentChangedEvent = z.infer<typeof appointmentChangedSchema>

interface UseRealtimeOptions {
  branchId: string | undefined
  queryKey: readonly unknown[]
  onChange?: (event: AppointmentChangedEvent) => void
}

export const useRealtime = ({ branchId, queryKey, onChange }: UseRealtimeOptions): void => {
  const session = useSession()
  const queryClient = useQueryClient()
  const accessToken = session?.accessToken
  const latest = useRef({ queryKey, onChange })

  useEffect(() => {
    latest.current = { queryKey, onChange }
  })

  useEffect(() => {
    if (!accessToken || !branchId) return

    const socket = io(`${API_URL}${REALTIME_NAMESPACE}`, {
      auth: { token: accessToken },
      transports: ["websocket"],
      withCredentials: true
    })
    let reconnected = false

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: latest.current.queryKey })
    }

    socket.on("connect", () => {
      socket.emit(SUBSCRIBE, { branchId })
      if (reconnected) invalidate()
      reconnected = true
    })

    socket.on(APPOINTMENT_CHANGED, (payload: unknown) => {
      const parsed = appointmentChangedSchema.safeParse(payload)
      if (!parsed.success || parsed.data.branchId !== branchId) return
      invalidate()
      latest.current.onChange?.(parsed.data)
    })

    return () => {
      socket.removeAllListeners()
      socket.disconnect()
    }
  }, [accessToken, branchId, queryClient])
}
