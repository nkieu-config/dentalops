import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "../../test/render"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router"
import { Toaster, toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { stubHorizontalOverflow } from "../../test/overflow"
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

const TimelineLocation = () => <span data-testid="timeline-location">{useLocation().search}</span>

const directory = () => [
  http.get(`${API}/branches`, () =>
    HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {}, timezone: "Asia/Bangkok", isActive: true }])
  ),
  http.get(`${API}/staff`, () =>
    HttpResponse.json([
      { id: anongId, name: "Dr. Anong", role: "dentist", isActive: true },
      { id: boonId, name: "Dr. Boon", role: "dentist", isActive: true }
    ])
  ),
  http.get(`${API}/shifts`, () =>
    HttpResponse.json([
      {
        id: "3f9619ff-8b86-4d01-b42d-00cf4fc964ff",
        staffId: anongId,
        branchId,
        startsAt: "2026-08-03T02:00:00.000Z",
        endsAt: "2026-08-03T10:00:00.000Z"
      },
      {
        id: "4f9619ff-8b86-4d01-b42d-00cf4fc964ff",
        staffId: boonId,
        branchId,
        startsAt: "2026-08-03T02:00:00.000Z",
        endsAt: "2026-08-03T10:00:00.000Z"
      }
    ])
  ),
  http.get(`${API}/availability`, () => HttpResponse.json({ slots: [] }))
]

const mount = (viewport: Viewport, entry = "/app/timeline?d=2026-08-03") => {
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
      <MemoryRouter initialEntries={[entry]}>
        <TimelinePage />
        <TimelineLocation />
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
    expect(screen.getByTestId("timeline-command-surface")).toHaveClass("rounded-hero")
    expect(screen.getByTestId("timeline-date-controls")).toHaveClass(
      "grid-cols-[auto_2.75rem_minmax(0,1fr)_2.75rem_auto]"
    )
    expect(screen.getByLabelText("Previous day")).toHaveClass("shrink-0", "h-11", "w-11", "[@media(pointer:coarse)]:h-11")
    expect(screen.getByLabelText("Next day")).toHaveClass("shrink-0", "h-11", "w-11", "[@media(pointer:coarse)]:h-11")
    expect(screen.queryByRole("radio", { name: "Day" })).not.toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: "Dentists" })).not.toBeInTheDocument()
    const timeline = screen.getByTestId("timeline-page")
    expect(timeline).toHaveClass("min-h-0", "flex-1")
    expect(timeline.className).not.toContain("100dvh")
    expect(timeline.className).not.toContain("calc(")
  })

  it("keeps the mobile dentist filter in the timeline URL", async () => {
    server.use(
      ...directory(),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([appointment(anongId), appointment(boonId, "a1000000-0000-4000-8000-000000000022")])
      )
    )
    mount("sm", `/app/timeline?d=2026-08-03&df=${anongId}`)

    expect(await screen.findByTestId(`agenda-${apptId}`)).toBeInTheDocument()
    expect(screen.queryByTestId("agenda-a1000000-0000-4000-8000-000000000022")).not.toBeInTheDocument()
    expect(screen.getByRole("radio", { name: /^Dr\. Anong,/ })).toHaveAttribute("data-state", "on")

    await userEvent.click(screen.getByRole("radio", { name: /^Dr\. Boon,/ }))
    await waitFor(() =>
      expect(screen.getByTestId("timeline-location")).toHaveTextContent(`?d=2026-08-03&df=${boonId}`)
    )
    expect(screen.getByTestId("agenda-a1000000-0000-4000-8000-000000000022")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("radio", { name: /^All dentists,/ }))
    await waitFor(() =>
      expect(screen.getByTestId("timeline-location")).toHaveTextContent("?d=2026-08-03")
    )
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
    await userEvent.click(screen.getByRole("button", { name: "Reschedule" }))
    await userEvent.click(await screen.findByRole("button", { name: "12:00" }))
    expect(bodies).toEqual([])
    await userEvent.click(screen.getByRole("button", { name: "Confirm new time" }))

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
    expect(scroll.className).toContain("snap-proximity")
    expect(scroll.className).toContain("scroll-pl-timegutter")

    const column = screen.getByTestId(`col-${anongId}`)
    expect(column.className).toContain("snap-start")
    expect(column.className).toContain("min-w-col-md")
    expect(column.className).not.toContain("min-w-col-min")
    expect(screen.getByRole("button", { name: /Columns · 2 of 2/ })).toBeInTheDocument()
    expect(screen.getByTestId(`overlay-${anongId}`)).toBeInTheDocument()
  })

  it("drops a column the picker unchecks and brings it back when rechecked", async () => {
    server.use(
      ...directory(),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount("md")

    expect(await screen.findByTestId(`col-${boonId}`)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Columns · 2 of 2/ }))
    const boon = await screen.findByRole("checkbox", { name: "Dr. Boon" })
    expect(boon).toBeChecked()

    await userEvent.click(boon)
    await waitFor(() => expect(screen.queryByTestId(`col-${boonId}`)).not.toBeInTheDocument())
    expect(screen.getByTestId(`col-${anongId}`)).toBeInTheDocument()
    expect(screen.getByTestId("timeline-location")).toHaveTextContent(
      `?d=2026-08-03&h=${boonId}`
    )

    await userEvent.click(screen.getByRole("checkbox", { name: "Dr. Boon" }))
    await waitFor(() => expect(screen.getByTestId(`col-${boonId}`)).toBeInTheDocument())
    expect(screen.getByTestId("timeline-location")).toHaveTextContent("?d=2026-08-03")
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
    expect(screen.queryByRole("button", { name: /Columns/ })).not.toBeInTheDocument()
  })

  it("preserves columns hidden on tablet when the workspace grows to desktop", async () => {
    server.use(
      ...directory(),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount("lg", `/app/timeline?d=2026-08-03&h=${boonId}`)

    expect(await screen.findByTestId(`col-${anongId}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`col-${boonId}`)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Columns · 1 of 2/ })).toBeInTheDocument()
  })

  it("offers the column picker on desktop once the columns stop fitting", async () => {
    const restore = stubHorizontalOverflow(700, 900)
    server.use(
      ...directory(),
      http.get(`${API}/appointments`, () => HttpResponse.json([appointment(anongId)]))
    )
    mount("lg")

    try {
      expect(await screen.findByTestId("timeline-more-end")).toBeInTheDocument()
      expect(await screen.findByRole("button", { name: /Columns · 2 of 2/ })).toBeInTheDocument()
    } finally {
      restore()
    }
  })
})
