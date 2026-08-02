import type { Appointment, Resource, StaffMember } from "@dentalops/contracts"
import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router"

export type ColumnMode = "dentist" | "chair"

export interface TimelineColumn {
  id: string
  name: string
  staffId?: string
}

const MODE_PARAM = "c"

interface ColumnModeInput {
  dentists: StaffMember[]
  chairs: Resource[]
}

export interface ColumnModeResult {
  mode: ColumnMode
  setMode: (next: ColumnMode) => void
  columns: TimelineColumn[]
  columnOf: (appointment: Appointment) => string | null
}

export const columnModeFrom = (params: URLSearchParams): ColumnMode =>
  params.get(MODE_PARAM) === "chair" ? "chair" : "dentist"

export const useColumnMode = ({ dentists, chairs }: ColumnModeInput): ColumnModeResult => {
  const [params, setParams] = useSearchParams()
  const mode = columnModeFrom(params)

  const columns = useMemo(
    () =>
      mode === "chair"
        ? chairs.map((chair) => ({ id: chair.id, name: chair.name }))
        : dentists.map((dentist) => ({ id: dentist.id, name: dentist.name, staffId: dentist.id })),
    [mode, chairs, dentists]
  )

  const chairIds = useMemo(() => new Set(chairs.map((chair) => chair.id)), [chairs])

  const columnOf = useCallback(
    (appointment: Appointment): string | null => {
      if (mode === "dentist") return appointment.dentistId
      const seat = appointment.claims.find(
        (held) => held.status === "active" && chairIds.has(held.resourceId)
      )
      return seat?.resourceId ?? null
    },
    [mode, chairIds]
  )

  const setMode = useCallback(
    (next: ColumnMode) => {
      const merged = new URLSearchParams(params)
      if (next === "chair") merged.set(MODE_PARAM, next)
      else merged.delete(MODE_PARAM)
      setParams(merged)
    },
    [params, setParams]
  )

  return { mode, setMode, columns, columnOf }
}
