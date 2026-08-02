import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { Toaster, toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { setViewport, type Viewport } from "../../test/viewport"
import { TimelinePage } from "./timeline-page"

vi.mock("socket.io-client", async () => await import("../../test/socket-io-stub"))

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const anongId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const boonId = "8f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const patientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const apptId = "a1000000-0000-4000-8000-000000000021"

const appointment = (dentistId: string, id = apptId) => ({
  id,
  branchId,
  serviceId,
  dentistId,
  patientId,
  startsAt: "2026-08-03T02:00:00.000Z",
  endsAt: "2026-08-03T03:00:00.000Z",
  status: "confirmed",
  version: 1,
  seriesId: null,
  service: { id: serviceId, name: "Cleaning", colorIndex: 0 },
  patient: { id: patientId, name: "S. Chaiwat", phone: "0812345678" },
  claims: []
})

const directory = () => [
  http.get(`${API}/branches`, () =>
    HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {} }])
  ),
  http.get(`${API}/staff`, () =>
    HttpResponse.json([
      { id: anongId, name: "Dr. Anong", role: "dentist", isActive: true },
      { id: boonId, name: "Dr. Boon", role: "dentist", isActive: true }
    ])
  ),
  http.get(`${API}/shifts`, () => HttpResponse.json([])),
  http.get(`${API}/availability`, () => HttpResponse.json({ slots: [] }))
]

const mount = (viewport: Viewport) => {
  setViewport(viewport)
  setSession({
    accessToken: "t1",
    user: {
      id: "7f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      tenantId: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      name: "Demo User",
      role: "receptionist"
    }
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/app/timeline?d=2026-08-03"]}>
        <TimelinePage />
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>
  )
}

afterEach(() => toast.dismiss())

describe("TimelinePage responsive modes", () => {
  it("renders the agenda below 768 with no drag machinery anywhere in the dom", async () => {
    server.use(
      ...directory(),
      http.get(`${API}/appointments`, () => HttpResponse.json([appointment(anongId)]))
    )
    mount("sm")

    await waitFor(() =>
      expect(document.querySelectorAll(`[data-testid$="${apptId}"]`).length).toBeGreaterThan(0)
    )
    expect(document.querySelectorAll('[data-testid^="overlay-"]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-testid^="resize-"]')).toHaveLength(0)
    expect(screen.queryByTestId("timegrid-scroll")).not.toBeInTheDocument()
    expect(screen.queryByTestId(`col-${anongId}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`appt-${apptId}`)).not.toBeInTheDocument()
    expect(screen.getByTestId(`agenda-${apptId}`)).toBeInTheDocument()
  })

  it("still reschedules below 768 through the drawer's slot picker", async () => {
    const bodies: unknown[] = []
    let stored = appointment(anongId)
    server.use(
      http.get(`${API}/availability`, () =>
        HttpResponse.json({
          slots: [
            { dentistId: anongId, startsAt: "2026-08-03T05:00:00.000Z", endsAt: "2026-08-03T06:00:00.000Z" }
          ]
        })
      ),
      ...directory(),
      http.get(`${API}/appointments`, () => HttpResponse.json([stored])),
      http.patch(`${API}/appointments/${apptId}`, async ({ request }) => {
        bodies.push(await request.json())
        stored = {
          ...stored,
          startsAt: "2026-08-03T05:00:00.000Z",
          endsAt: "2026-08-03T06:00:00.000Z",
          version: 2
        }
        return HttpResponse.json(stored)
      })
    )
    mount("sm")

    await userEvent.click(await screen.findByTestId(`agenda-${apptId}`))
    expect(await screen.findByRole("dialog")).toHaveTextContent("Cleaning")
    await userEvent.click(await screen.findByRole("button", { name: "12:00" }))

    await waitFor(() =>
      expect(bodies).toEqual([{ version: 1, startsAt: "2026-08-03T05:00:00.000Z" }])
    )
    await waitFor(() =>
      expect(screen.getByTestId(`agenda-${apptId}`)).toHaveTextContent("12:00–13:00")
    )
    expect(screen.getByRole("status")).toHaveTextContent("Moved to 12:00")
  })

  it("snaps the columns and offers a column picker between 768 and 1023", async () => {
    server.use(
      ...directory(),
      http.get(`${API}/appointments`, () => HttpResponse.json([appointment(anongId)]))
    )
    mount("md")

    const scroll = await screen.findByTestId("timegrid-scroll")
    expect(scroll.className).toContain("snap-x")
    expect(scroll.className).toContain("snap-mandatory")
    expect(scroll.className).toContain("scroll-pl-timegutter")

    const column = screen.getByTestId(`col-${anongId}`)
    expect(column.className).toContain("snap-start")
    expect(column.className).toContain("min-w-col-md")
    expect(column.className).not.toContain("min-w-col-min")
    expect(screen.getByRole("button", { name: "Columns" })).toBeInTheDocument()
    expect(screen.getByTestId(`overlay-${anongId}`)).toBeInTheDocument()
  })

  it("drops a column the picker unchecks and brings it back when rechecked", async () => {
    server.use(
      ...directory(),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount("md")

    expect(await screen.findByTestId(`col-${boonId}`)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Columns" }))
    const boon = await screen.findByRole("checkbox", { name: "Dr. Boon" })
    expect(boon).toBeChecked()

    await userEvent.click(boon)
    await waitFor(() => expect(screen.queryByTestId(`col-${boonId}`)).not.toBeInTheDocument())
    expect(screen.getByTestId(`col-${anongId}`)).toBeInTheDocument()

    await userEvent.click(screen.getByRole("checkbox", { name: "Dr. Boon" }))
    await waitFor(() => expect(screen.getByTestId(`col-${boonId}`)).toBeInTheDocument())
  })

  it("keeps the full unsnapped grid at 1024 and above", async () => {
    server.use(
      ...directory(),
      http.get(`${API}/appointments`, () => HttpResponse.json([appointment(anongId)]))
    )
    mount("lg")

    expect(await screen.findByTestId(`resize-${apptId}`)).toBeInTheDocument()
    const scroll = screen.getByTestId("timegrid-scroll")
    expect(scroll.className).not.toContain("snap-")
    const column = screen.getByTestId(`col-${anongId}`)
    expect(column.className).not.toContain("snap-start")
    expect(column.className).toContain("min-w-col-min")
    expect(screen.getByTestId(`col-${boonId}`)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Columns" })).not.toBeInTheDocument()
  })
})
