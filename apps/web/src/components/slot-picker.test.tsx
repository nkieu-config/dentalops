import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { API, delay, http, HttpResponse, server } from "../test/msw"
import { SlotPicker } from "./slot-picker"

const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const slot = (startsAt: string, endsAt: string) => ({ dentistId, startsAt, endsAt })

const mount = (date = "2026-08-03") => {
  const onPick = vi.fn()
  const onDateChange = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SlotPicker
        serviceId={serviceId}
        branchId={branchId}
        dentistId={dentistId}
        date={date}
        onPick={onPick}
        onDateChange={onDateChange}
      />
    </QueryClientProvider>
  )
  return { onPick, onDateChange }
}

describe("SlotPicker", () => {
  it("asks for the Bangkok day and splits the answer into morning and afternoon", async () => {
    const queries: Record<string, string>[] = []
    server.use(
      http.get(`${API}/availability`, ({ request }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams))
        return HttpResponse.json({
          slots: [
            slot("2026-08-03T02:30:00.000Z", "2026-08-03T03:30:00.000Z"),
            slot("2026-08-03T06:00:00.000Z", "2026-08-03T07:00:00.000Z")
          ]
        })
      })
    )
    mount()

    expect(await screen.findByTestId("group-morning")).toBeInTheDocument()
    expect(within(screen.getByTestId("group-morning")).getByRole("button")).toHaveTextContent(
      "09:30"
    )
    expect(within(screen.getByTestId("group-afternoon")).getByRole("button")).toHaveTextContent(
      "13:00"
    )
    expect(queries).toEqual([
      {
        serviceId,
        branchId,
        dentistId,
        from: "2026-08-02T17:00:00.000Z",
        to: "2026-08-03T17:00:00.000Z"
      }
    ])
  })

  it("hands back the untouched iso string of the chip that was pressed", async () => {
    server.use(
      http.get(`${API}/availability`, () =>
        HttpResponse.json({
          slots: [slot("2026-08-03T02:30:00.000Z", "2026-08-03T03:30:00.000Z")]
        })
      )
    )
    const { onPick } = mount()

    await userEvent.click(await screen.findByRole("button", { name: "09:30" }))
    expect(onPick).toHaveBeenCalledWith("2026-08-03T02:30:00.000Z")
  })

  it("says the day is free of openings instead of offering unavailable chips", async () => {
    server.use(http.get(`${API}/availability`, () => HttpResponse.json({ slots: [] })))
    mount()

    expect(await screen.findByText("No free slots this day")).toBeInTheDocument()
    expect(screen.queryAllByTestId("slot")).toHaveLength(0)
  })

  it("steps the day across a month boundary in both directions", async () => {
    server.use(http.get(`${API}/availability`, () => HttpResponse.json({ slots: [] })))
    const { onDateChange } = mount("2026-08-31")
    await screen.findByText("No free slots this day")

    await userEvent.click(screen.getByRole("button", { name: "Next day of slots" }))
    expect(onDateChange).toHaveBeenLastCalledWith("2026-09-01")

    await userEvent.click(screen.getByRole("button", { name: "Previous day of slots" }))
    expect(onDateChange).toHaveBeenLastCalledWith("2026-08-30")
  })

  it("gives every chip a 44px touch target and lining figures", async () => {
    server.use(
      http.get(`${API}/availability`, () =>
        HttpResponse.json({
          slots: [
            slot("2026-08-03T02:30:00.000Z", "2026-08-03T03:30:00.000Z"),
            slot("2026-08-03T06:00:00.000Z", "2026-08-03T07:00:00.000Z")
          ]
        })
      )
    )
    mount()

    const chips = await screen.findAllByTestId("slot")
    expect(chips).toHaveLength(2)
    for (const chip of chips) {
      const height = /min-h-(\d+)/.exec(chip.className)
      expect(height).not.toBeNull()
      expect(Number(height?.[1]) * 4).toBeGreaterThanOrEqual(44)
      expect(chip.className).toContain("tabular-nums")
    }
  })

  it("holds the space with a skeleton while the day loads and reports a failed load", async () => {
    server.use(
      http.get(`${API}/availability`, async () => {
        await delay(20)
        return HttpResponse.json(
          { statusCode: 500, errorCode: "INTERNAL", message: "boom", requestId: "r" },
          { status: 500 }
        )
      })
    )
    mount()

    expect(screen.getAllByTestId("slot-skeleton").length).toBeGreaterThan(0)
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("Could not load free slots")).toBeInTheDocument())
    expect(screen.queryAllByTestId("slot-skeleton")).toHaveLength(0)
  })
})
