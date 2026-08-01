import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import type { RescheduleInput } from "./use-reschedule"

const MINUTE = 60_000
const NUDGE_MIN = 15

interface GridKeyboardOptions {
  reschedule: (input: RescheduleInput) => void
  isBusy: (id: string) => boolean
}

interface GridCard {
  element: HTMLElement
  id: string
  dentistId: string
  startMs: number
  version: number
}

const NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])

const readCards = (root: HTMLElement): GridCard[] =>
  [...root.querySelectorAll<HTMLElement>("[data-appt]")].flatMap((element) => {
    const { appt, dentist, starts, version } = element.dataset
    if (appt === undefined || dentist === undefined || starts === undefined) return []
    return [
      {
        element,
        id: appt,
        dentistId: dentist,
        startMs: Date.parse(starts),
        version: Number(version)
      }
    ]
  })

const byStart = (a: GridCard, b: GridCard) => a.startMs - b.startMs || a.id.localeCompare(b.id)

const nearestTo = (startMs: number) => (a: GridCard, b: GridCard) =>
  Math.abs(a.startMs - startMs) - Math.abs(b.startMs - startMs) || byStart(a, b)

export const useGridKeyboard = ({ reschedule, isBusy }: GridKeyboardOptions) => ({
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!NAV_KEYS.has(event.key)) return
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown"
    if (event.shiftKey && !vertical) return
    const focused = document.activeElement
    if (!(focused instanceof HTMLElement) || focused.dataset.appt === undefined) return
    const cards = readCards(event.currentTarget)
    const current = cards.find((card) => card.element === focused)
    if (!current) return
    event.preventDefault()
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1

    if (event.shiftKey) {
      if (isBusy(current.id)) return
      reschedule({
        id: current.id,
        version: current.version,
        startsAt: new Date(current.startMs + step * NUDGE_MIN * MINUTE).toISOString()
      })
      return
    }

    if (vertical) {
      const column = cards.filter((card) => card.dentistId === current.dentistId).sort(byStart)
      const index = column.findIndex((card) => card.id === current.id)
      column[index + step]?.element.focus()
      return
    }

    const order = [...new Set(cards.map((card) => card.dentistId))]
    const neighbour = order[order.indexOf(current.dentistId) + step]
    if (neighbour === undefined) return
    const [target] = cards
      .filter((card) => card.dentistId === neighbour)
      .sort(nearestTo(current.startMs))
    target?.element.focus()
  }
})
