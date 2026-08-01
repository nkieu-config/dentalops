import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import { API, http, HttpResponse, server } from "../../test/msw"
import { TimelinePage } from "./timeline-page"

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const otherDentistId = "8f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const patientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const appointment = (
  id: string,
  dentist: string,
  startsAt: string,
  endsAt: string,
  serviceName = "Cleaning"
) => ({
  id,
  branchId,
  serviceId,
  dentistId: dentist,
  patientId,
  startsAt,
  endsAt,
  status: "confirmed",
  version: 1,
  seriesId: null,
  service: { id: serviceId, name: serviceName, colorIndex: 0 },
  patient: { id: patientId, name: "S. Chaiwat", phone: "0812345678" },
  claims: []
})

const directory = (dentists: { id: string; name: string }[]) => [
  http.get(`${API}/branches`, () =>
    HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {} }])
  ),
  http.get(`${API}/staff`, () =>
    HttpResponse.json(dentists.map((d) => ({ ...d, role: "dentist", isActive: true })))
  ),
  http.get(`${API}/shifts`, () => HttpResponse.json([]))
]

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/timeline?d=2026-08-03"]}>
        <TimelinePage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("TimelinePage", () => {
  it("renders the grid for the branch and day in the url", async () => {
    server.use(
      http.get(`${API}/branches`, () =>
        HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {} }])
      ),
      http.get(`${API}/staff`, () =>
        HttpResponse.json([{ id: dentistId, name: "Dr. Anong", role: "dentist", isActive: true }])
      ),
      http.get(`${API}/shifts`, () =>
        HttpResponse.json([
          {
            id: "3f9619ff-8b86-4d01-b42d-00cf4fc964ff",
            staffId: dentistId,
            branchId,
            startsAt: "2026-08-03T02:00:00.000Z",
            endsAt: "2026-08-03T10:00:00.000Z"
          }
        ])
      ),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment(
            "4f9619ff-8b86-4d01-b42d-00cf4fc964ff",
            dentistId,
            "2026-08-03T02:00:00.000Z",
            "2026-08-03T03:00:00.000Z"
          )
        ])
      )
    )
    mount()
    expect(await screen.findByText("Dr. Anong")).toBeInTheDocument()
    expect(await screen.findByText("Cleaning")).toBeInTheDocument()
    expect(screen.getByText("Mon, 3 Aug 2026")).toBeInTheDocument()
    const blocks = screen.getAllByTestId("offshift")
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toHaveStyle({ top: "0px", height: "576px" })
  })

  it("lays lanes out per dentist so one column never narrows another", async () => {
    server.use(
      ...directory([
        { id: dentistId, name: "Dr. Anong" },
        { id: otherDentistId, name: "Dr. Boon" }
      ]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment("a1000000-0000-4000-8000-000000000001", dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z"),
          appointment("a1000000-0000-4000-8000-000000000002", dentistId, "2026-08-03T02:30:00.000Z", "2026-08-03T03:30:00.000Z"),
          appointment("a1000000-0000-4000-8000-000000000003", otherDentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z"),
          appointment("a1000000-0000-4000-8000-000000000004", otherDentistId, "2026-08-03T02:30:00.000Z", "2026-08-03T03:30:00.000Z")
        ])
      )
    )
    mount()
    const first = await screen.findByTestId("appt-a1000000-0000-4000-8000-000000000001")
    const second = screen.getByTestId("appt-a1000000-0000-4000-8000-000000000002")
    const third = screen.getByTestId("appt-a1000000-0000-4000-8000-000000000003")

    expect(first.style.width).toBe("calc(50% - 4px)")
    expect(first.style.left).toBe("calc(0% + 2px)")
    expect(second.style.left).toBe("calc(50% + 2px)")
    expect(third.style.width).toBe("calc(50% - 4px)")
    expect(third.style.left).toBe("calc(0% + 2px)")
    expect(screen.getByTestId(`col-${dentistId}`).contains(third)).toBe(false)
  })

  it("opens the details drawer for the card that was clicked", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment(
            "a1000000-0000-4000-8000-000000000005",
            dentistId,
            "2026-08-03T02:00:00.000Z",
            "2026-08-03T03:00:00.000Z",
            "Root canal"
          )
        ])
      )
    )
    mount()
    await userEvent.click(await screen.findByTestId("appt-a1000000-0000-4000-8000-000000000005"))

    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("Root canal")
    expect(dialog).toHaveTextContent("09:00–10:00")
    expect(dialog).toHaveTextContent("S. Chaiwat · 0812345678")
  })

  it("drags a range on a dentist column into a prefilled booking drawer", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([])),
      http.get(`${API}/services`, () => HttpResponse.json([])),
      http.get(`${API}/patients`, () => HttpResponse.json({ items: [], nextCursor: null }))
    )
    mount()
    const overlay = await screen.findByTestId(`overlay-${dentistId}`)

    fireEvent.pointerDown(overlay, { clientY: 576, button: 0 })
    fireEvent.pointerMove(overlay, { clientY: 640 })
    expect(screen.getByTestId("ghost")).toHaveStyle({ top: "576px", height: "64px" })

    fireEvent.pointerUp(overlay)
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("New appointment")
    expect(dialog).toHaveTextContent("Dr. Anong")
    expect(dialog).toHaveTextContent("09:00")
  })

  it("stacks cards above the drag overlay so a card press never starts a drag", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment(
            "a1000000-0000-4000-8000-000000000006",
            dentistId,
            "2026-08-03T02:00:00.000Z",
            "2026-08-03T03:00:00.000Z"
          )
        ])
      )
    )
    mount()
    const card = await screen.findByTestId("appt-a1000000-0000-4000-8000-000000000006")
    const overlay = screen.getByTestId(`overlay-${dentistId}`)

    expect(overlay.contains(card)).toBe(false)
    expect(card.compareDocumentPosition(overlay) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(card.className).toContain("z-[5]")
    expect(overlay.className).not.toMatch(/(^|\s)z-/)

    fireEvent.pointerDown(card, { clientY: 576, button: 0 })
    fireEvent.pointerMove(card, { clientY: 640 })
    expect(screen.queryByTestId("ghost")).not.toBeInTheDocument()

    fireEvent.pointerUp(card)
    await userEvent.click(card)
    expect(await screen.findByRole("dialog")).toHaveTextContent("Cleaning")
  })
})
