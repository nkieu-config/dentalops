import type { UserRole } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor, within } from "../../test/render"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { Toaster, toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { APPOINTMENT_CHANGED } from "../../lib/realtime"
import { setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { goOffline, goOnline } from "../../test/network"
import { fireSocketEvent, resetSocketMock } from "../../test/socket-io-stub"
import { TimelinePage } from "./timeline-page"

vi.mock("socket.io-client", async () => await import("../../test/socket-io-stub"))

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const otherDentistId = "8f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const patientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const chairOneId = "c1000000-0000-4000-8000-000000000001"
const chairTwoId = "c1000000-0000-4000-8000-000000000002"

const claim = (resourceId: string, status: "active" | "released" = "active") => ({
  id: `a1000000-0000-4000-8000-0000000000${resourceId.slice(-2)}`,
  resourceId,
  startsAt: "2026-08-03T02:00:00.000Z",
  endsAt: "2026-08-03T03:10:00.000Z",
  status
})

const chairs = () =>
  http.get(`${API}/resources`, () =>
    HttpResponse.json([
      { id: chairOneId, name: "Chair 1", type: "chair", branchId },
      { id: chairTwoId, name: "Chair 2", type: "chair", branchId }
    ])
  )

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

const closedAllWeek = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: []
}

const directory = (
  dentists: { id: string; name: string }[],
  branchRows: { id: string; name: string; openingHours?: unknown }[] = [
    { id: branchId, name: "Sukhumvit" }
  ]
) => [
  http.get(`${API}/branches`, () =>
    HttpResponse.json(
      branchRows.map((branch) => ({
        id: branch.id,
        name: branch.name,
        openingHours: branch.openingHours ?? {},
        timezone: "Asia/Bangkok",
        isActive: true
      }))
    )
  ),
  http.get(`${API}/staff`, () =>
    HttpResponse.json(dentists.map((d) => ({ ...d, role: "dentist", isActive: true })))
  ),
  http.get(`${API}/shifts`, () => HttpResponse.json([])),
  http.get(`${API}/availability`, () => HttpResponse.json({ slots: [] }))
]

const mount = (role: UserRole = "receptionist", entry = "/app/timeline?d=2026-08-03") => {
  setSession({
    accessToken: "t1",
    user: {
      id: "7f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      tenantId: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
      name: "Demo User",
      role
    }
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <TimelinePage />
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>
  )
}

afterEach(() => {
  toast.dismiss()
  resetSocketMock()
})

describe("TimelinePage", () => {
  it("opens an appointment linked directly from a patient record", async () => {
    const id = "a1000000-0000-4000-8000-000000000005"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z", "Root canal")
        ])
      )
    )

    mount("receptionist", `/app/timeline?d=2026-08-03&a=${id}`)

    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("Root canal")
    expect(dialog).toHaveTextContent("S. Chaiwat")
  })

  it("opens the booking flow requested from a patient record", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([])),
      http.get(`${API}/services`, () => HttpResponse.json([])),
      http.get(`${API}/patients`, () => HttpResponse.json({ items: [], nextCursor: null })),
      http.get(`${API}/patients/${patientId}`, () =>
        HttpResponse.json({
          id: patientId,
          name: "S. Chaiwat",
          phone: "0812345678",
          email: "chaiwat@example.com",
          notes: null,
          appointments: []
        })
      )
    )

    mount("receptionist", `/app/timeline?d=2026-08-03&new=appointment&p=${patientId}`)

    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("New appointment")
    expect((await within(dialog).findAllByText("S. Chaiwat")).length).toBeGreaterThan(0)
  })

  it("lets the user retry after the clinic directory fails to load", async () => {
    let branchRequests = 0
    server.use(
      http.get(`${API}/branches`, () => {
        branchRequests += 1
        return branchRequests === 1
          ? HttpResponse.json({ message: "Unavailable" }, { status: 500 })
          : HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {}, timezone: "Asia/Bangkok", isActive: true }])
      }),
      http.get(`${API}/staff`, () =>
        HttpResponse.json([{ id: dentistId, name: "Dr. Anong", role: "dentist", isActive: true }])
      ),
      http.get(`${API}/shifts`, () => HttpResponse.json([])),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount()

    expect(await screen.findByText("Could not load the clinic")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(await screen.findByTestId("timeline-page")).toBeInTheDocument()
    expect(branchRequests).toBe(2)
  })

  it("renders the grid for the branch and day in the url", async () => {
    server.use(
      http.get(`${API}/branches`, () =>
        HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {}, timezone: "Asia/Bangkok", isActive: true }])
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
    expect(screen.getByText("Mon 3 Aug")).toBeInTheDocument()
    const blocks = screen.getAllByTestId("offshift")
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toHaveStyle({ top: "0px", height: "64px" })
  })

  it("shows only dentists rostered for the selected branch when the day has schedule data", async () => {
    server.use(
      ...directory([
        { id: dentistId, name: "Dr. Anong" },
        { id: otherDentistId, name: "Dr. Boon" }
      ]),
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
    await waitFor(() => expect(screen.queryByText("Dr. Boon")).not.toBeInTheDocument())
  })

  it("anchors the schedule in a visible page heading and calendar date control", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount()

    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Choose schedule date" })).toHaveTextContent(
      "Mon 3 Aug"
    )
    expect(screen.queryByText("SCHEDULE")).not.toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Branch" })).toHaveTextContent(
      "Branch·Sukhumvit"
    )
  })

  it("keeps the grid usable and offers a retry when only appointments fail to load", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json({ statusCode: 500, errorCode: "INTERNAL", message: "boom", requestId: "r" }, { status: 500 })
      )
    )
    mount()

    expect(await screen.findByText("Dr. Anong")).toBeInTheDocument()
    expect(await screen.findByText("This schedule may be incomplete")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  })

  it("says nobody is rostered instead of leaving the day a blank grey canvas", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount()

    expect(await screen.findByTestId("nobody-rostered")).toHaveTextContent(
      "Nobody is on shift on Mon 3 Aug"
    )
    expect(screen.getByRole("button", { name: "Open Roster" })).toBeInTheDocument()
    expect(screen.getByTestId(`col-${dentistId}`)).toBeInTheDocument()
    expect(screen.getByTestId(`overlay-${dentistId}`)).toBeInTheDocument()
  })

  it("separates an open but unbooked day from a day with no cover", async () => {
    server.use(
      http.get(`${API}/branches`, () =>
        HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {}, timezone: "Asia/Bangkok", isActive: true }])
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
      http.get(`${API}/availability`, () => HttpResponse.json({ slots: [] })),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount()

    expect(await screen.findByTestId("nothing-booked")).toHaveTextContent("Nothing booked yet")
    expect(screen.queryByTestId("nobody-rostered")).not.toBeInTheDocument()
  })

  it("claims neither empty nor closed while the day's data is missing", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json({ statusCode: 500, errorCode: "INTERNAL", message: "boom", requestId: "r" }, { status: 500 })
      )
    )
    mount()

    expect(await screen.findByText("This schedule may be incomplete")).toBeInTheDocument()
    expect(screen.queryByTestId("nobody-rostered")).not.toBeInTheDocument()
    expect(screen.queryByTestId("nothing-booked")).not.toBeInTheDocument()
  })

  it("does not mark staff as off shift when shifts cannot be loaded", async () => {
    server.use(
      http.get(`${API}/branches`, () =>
        HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {}, timezone: "Asia/Bangkok", isActive: true }])
      ),
      http.get(`${API}/staff`, () =>
        HttpResponse.json([{ id: dentistId, name: "Dr. Anong", role: "dentist", isActive: true }])
      ),
      http.get(`${API}/shifts`, () =>
        HttpResponse.json({ statusCode: 500, errorCode: "INTERNAL", message: "boom", requestId: "r" }, { status: 500 })
      ),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount()

    expect(await screen.findByText("Dr. Anong")).toBeInTheDocument()
    expect(await screen.findByText("Shift shading is unavailable")).toBeInTheDocument()
    await waitFor(() => expect(screen.queryAllByTestId("offshift")).toHaveLength(0))
  })

  it("keeps the command surface visible while appointments are still loading", async () => {
    let releaseAppointments = () => {}
    const appointmentsArrived = new Promise<void>((resolve) => {
      releaseAppointments = resolve
    })
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, async () => {
        await appointmentsArrived
        return HttpResponse.json([])
      })
    )
    mount()

    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeVisible()
    expect(await screen.findByTestId("appointments-loading")).toBeInTheDocument()
    expect(screen.queryByText("Nothing scheduled")).not.toBeInTheDocument()

    releaseAppointments()
    expect(await screen.findByTestId("timegrid-scroll")).toBeInTheDocument()
  })

  it("explains when chair day view has no chairs at the selected branch", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/resources`, () => HttpResponse.json([])),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount("receptionist", "/app/timeline?d=2026-08-03&c=chair")

    expect(await screen.findByText("No chairs at this branch")).toBeInTheDocument()
    expect(screen.queryByTestId("timegrid-scroll")).not.toBeInTheDocument()
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
    expect(dialog).toHaveTextContent("S. Chaiwat")
    expect(dialog).toHaveTextContent("0812345678")
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

    fireEvent.pointerDown(overlay, { clientY: 64, button: 0 })
    fireEvent.pointerMove(overlay, { clientY: 128 })
    expect(screen.getByTestId("ghost")).toHaveStyle({ top: "64px", height: "64px" })

    fireEvent.pointerUp(overlay)
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("New appointment")
    expect(within(dialog).getByLabelText("Dentist")).toHaveTextContent("Dr. Anong")
    expect(within(dialog).getByLabelText("Starts")).toHaveValue("09:00")
  })

  it("requires the receptionist to choose the dentist and time when booking from the toolbar", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([])),
      http.get(`${API}/services`, () => HttpResponse.json([])),
      http.get(`${API}/patients`, () => HttpResponse.json({ items: [], nextCursor: null }))
    )
    mount()
    await screen.findByText("Dr. Anong")

    await userEvent.click(screen.getByRole("button", { name: "New appointment" }))

    const dialog = await screen.findByRole("dialog")
    expect(dialog).toHaveTextContent("New appointment")
    expect(within(dialog).getByLabelText("Dentist")).toHaveTextContent("Choose a dentist")
    expect(within(dialog).getByLabelText("Starts")).toHaveValue("")
    expect(within(dialog).getByRole("button", { name: "Book appointment" })).toBeDisabled()
  })

  it("disables the toolbar's New appointment button for roles the api won't let create appointments", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    const asDentist = mount("dentist")
    expect(await screen.findByText("Dr. Anong")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "New appointment" })).toBeDisabled()
    asDentist.unmount()

    mount("receptionist")
    expect(await screen.findByRole("button", { name: "New appointment" })).toBeEnabled()
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
    expect(card.className).toContain("z-5")
    expect(overlay.className).not.toMatch(/(^|\s)z-/)

    fireEvent.pointerDown(card, { clientY: 0, button: 0 })
    fireEvent.pointerMove(card, { clientY: 2 })
    expect(screen.queryByTestId("ghost")).not.toBeInTheDocument()

    fireEvent.pointerUp(card)
    await userEvent.click(card)
    expect(await screen.findByRole("dialog")).toHaveTextContent("Cleaning")
  })

  it("drags a card to a new slot, previews it alone in shadow, and patches the new start", async () => {
    const id = "a1000000-0000-4000-8000-000000000007"
    const bodies: unknown[] = []
    let stored = appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([stored])),
      http.patch(`${API}/appointments/${id}`, async ({ request }) => {
        bodies.push(await request.json())
        stored = {
          ...stored,
          startsAt: "2026-08-03T03:00:00.000Z",
          endsAt: "2026-08-03T04:00:00.000Z",
          version: 2
        }
        return HttpResponse.json(stored)
      })
    )
    mount()
    const card = await screen.findByTestId(`appt-${id}`)

    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 640 })

    const preview = screen.getByTestId("drag-preview")
    expect(preview).toHaveStyle({ top: "64px", height: "64px" })
    expect(preview.className).toContain("shadow-lg")
    expect(card.className).toContain("opacity-40")
    const grid = screen.getByTestId("timegrid-scroll")
    expect([...grid.querySelectorAll('[class*="shadow-lg"]')]).toEqual([preview])

    fireEvent.pointerUp(window)
    expect(screen.queryByTestId("drag-preview")).not.toBeInTheDocument()
    await waitFor(() =>
      expect(bodies).toEqual([{ version: 1, startsAt: "2026-08-03T03:00:00.000Z" }])
    )
    await waitFor(() =>
      expect(screen.getByTestId(`appt-${id}`)).toHaveStyle({ top: "64px", height: "64px" })
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("snaps a rejected drag back and marks the appointment it collided with", async () => {
    const moving = "a1000000-0000-4000-8000-000000000008"
    const blocker = "a1000000-0000-4000-8000-000000000009"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment(moving, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z"),
          appointment(blocker, dentistId, "2026-08-03T03:00:00.000Z", "2026-08-03T04:00:00.000Z")
        ])
      ),
      http.patch(`${API}/appointments/${moving}`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            errorCode: "SLOT_CONFLICT",
            message: "Dentist is already booked at this time",
            details: { constraint: "no_dentist_double_booking", conflictingAppointmentId: blocker },
            requestId: "r1"
          },
          { status: 409 }
        )
      )
    )
    mount()
    const card = await screen.findByTestId(`appt-${moving}`)

    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 640 })
    fireEvent.pointerUp(window)

    expect(await screen.findByText("Conflicts with S. Chaiwat at 10:00")).toBeInTheDocument()
    expect(screen.getByTestId(`appt-${moving}`)).toHaveStyle({ top: "0px" })
    const blocked = screen.getByTestId(`appt-${blocker}`)
    expect(blocked.style.borderLeftColor).toBe("var(--hue0-border)")
    expect(blocked.className).not.toContain("ring-destructive")
    expect(screen.getByLabelText("Conflict")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Conflict — reverted")
  })

  it("nudges the focused card by a quarter hour and announces where it landed", async () => {
    const id = "a1000000-0000-4000-8000-000000000010"
    const bodies: unknown[] = []
    let stored = appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([stored])),
      http.patch(`${API}/appointments/${id}`, async ({ request }) => {
        bodies.push(await request.json())
        stored = {
          ...stored,
          startsAt: "2026-08-03T02:15:00.000Z",
          endsAt: "2026-08-03T03:15:00.000Z",
          version: 2
        }
        return HttpResponse.json(stored)
      })
    )
    mount()
    const card = await screen.findByTestId(`appt-${id}`)
    card.focus()

    expect(fireEvent.keyDown(card, { key: "ArrowDown", shiftKey: true })).toBe(false)

    await waitFor(() =>
      expect(bodies).toEqual([{ version: 1, startsAt: "2026-08-03T02:15:00.000Z" }])
    )
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Moved to 09:15"))
    await waitFor(() => expect(screen.getByTestId(`appt-${id}`)).toHaveStyle({ top: "16px" }))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("moves a card from the drawer slot picker onto the grid", async () => {
    const id = "a1000000-0000-4000-8000-000000000012"
    const bodies: unknown[] = []
    let stored = appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")
    server.use(
      http.get(`${API}/availability`, () =>
        HttpResponse.json({
          slots: [
            {
              dentistId,
              startsAt: "2026-08-03T05:00:00.000Z",
              endsAt: "2026-08-03T06:00:00.000Z"
            }
          ]
        })
      ),
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([stored])),
      http.patch(`${API}/appointments/${id}`, async ({ request }) => {
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
    mount()
    await userEvent.click(await screen.findByTestId(`appt-${id}`))
    await userEvent.click(screen.getByRole("button", { name: "Reschedule" }))
    await userEvent.click(await screen.findByRole("button", { name: "12:00" }))
    expect(bodies).toEqual([])
    await userEvent.click(screen.getByRole("button", { name: "Confirm new time" }))

    await waitFor(() =>
      expect(bodies).toEqual([{ version: 1, startsAt: "2026-08-03T05:00:00.000Z" }])
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId(`appt-${id}`)).toHaveStyle({ top: "192px" }))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Moved to 12:00"))
  })

  it("opens the drawer when the focused card is activated with Enter", async () => {
    const id = "a1000000-0000-4000-8000-000000000011"
    const bodies: unknown[] = []
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")
        ])
      ),
      http.patch(`${API}/appointments/${id}`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(
          appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")
        )
      })
    )
    mount()
    const card = await screen.findByTestId(`appt-${id}`)
    card.focus()
    await userEvent.keyboard("{Enter}")

    expect(await screen.findByRole("dialog")).toHaveTextContent("09:00–10:00")
    expect(bodies).toEqual([])
  })

  it("offers the drag overlay only to roles the api lets create appointments", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    const asDentist = mount("dentist")
    expect(await screen.findByTestId(`col-${dentistId}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`overlay-${dentistId}`)).not.toBeInTheDocument()
    asDentist.unmount()

    mount("receptionist")
    expect(await screen.findByTestId(`overlay-${dentistId}`)).toBeInTheDocument()
    expect(screen.getByText("Press question mark for keyboard shortcuts.")).toHaveClass("sr-only")
  })

  it("keeps branch, dentist, and chair context in the inspector from dentist view", async () => {
    const id = "a1000000-0000-4000-8000-000000000088"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      chairs(),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          {
            ...appointment(
              id,
              dentistId,
              "2026-08-03T02:00:00.000Z",
              "2026-08-03T03:00:00.000Z"
            ),
            claims: [claim(chairOneId)]
          }
        ])
      )
    )
    mount()

    const card = await screen.findByTestId(`appt-${id}`)
    expect(card).toHaveAccessibleName(
      "09:00–10:00, S. Chaiwat, Dr. Anong, Cleaning, Confirmed"
    )
    await userEvent.click(card)

    const meta = await screen.findByTestId("appointment-meta")
    expect(meta).toHaveTextContent("Sukhumvit")
    expect(meta).toHaveTextContent("Dr. Anong")
    await waitFor(() => expect(meta).toHaveTextContent("Chair 1"))
  })

  it("blocks a keyboard reschedule for roles the api won't let move appointments", async () => {
    const id = "a1000000-0000-4000-8000-000000000042"
    const bodies: unknown[] = []
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")
        ])
      ),
      http.patch(`${API}/appointments/${id}`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(
          appointment(id, dentistId, "2026-08-03T02:15:00.000Z", "2026-08-03T03:15:00.000Z")
        )
      })
    )
    mount("dentist")
    const card = await screen.findByTestId(`appt-${id}`)
    card.focus()

    fireEvent.keyDown(card, { key: "ArrowDown", shiftKey: true })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(bodies).toEqual([])

    fireEvent.keyDown(card, { key: "ArrowRight", shiftKey: true })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(bodies).toEqual([])
  })

  it("withdraws every write affordance while the browser is offline", async () => {
    const id = "a1000000-0000-4000-8000-000000000041"
    const bodies: unknown[] = []
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")
        ])
      ),
      http.patch(`${API}/appointments/${id}`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(
          appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")
        )
      })
    )
    mount("receptionist")
    const card = await screen.findByTestId(`appt-${id}`)
    expect(screen.getByTestId(`overlay-${dentistId}`)).toBeInTheDocument()

    goOffline()
    expect(screen.queryByTestId(`overlay-${dentistId}`)).not.toBeInTheDocument()

    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 640 })
    expect(screen.queryByTestId("drag-preview")).not.toBeInTheDocument()
    fireEvent.pointerUp(window)

    card.focus()
    fireEvent.keyDown(card, { key: "ArrowDown", shiftKey: true })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(bodies).toEqual([])

    goOnline()
    expect(await screen.findByTestId(`overlay-${dentistId}`)).toBeInTheDocument()
    card.focus()
    fireEvent.keyDown(card, { key: "ArrowDown", shiftKey: true })
    await waitFor(() =>
      expect(bodies).toEqual([{ version: 1, startsAt: "2026-08-03T02:15:00.000Z" }])
    )
  })

  it("seats every card in the chair it holds when the columns switch to chairs", async () => {
    const inChairOne = "a1000000-0000-4000-8000-000000000051"
    const inChairTwo = "a1000000-0000-4000-8000-000000000052"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      chairs(),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          {
            ...appointment(
              inChairOne,
              dentistId,
              "2026-08-03T02:00:00.000Z",
              "2026-08-03T03:00:00.000Z"
            ),
            claims: [claim(chairOneId)]
          },
          {
            ...appointment(
              inChairTwo,
              dentistId,
              "2026-08-03T04:00:00.000Z",
              "2026-08-03T05:00:00.000Z"
            ),
            claims: [claim(chairTwoId)]
          }
        ])
      )
    )
    mount("receptionist", "/app/timeline?d=2026-08-03&c=chair")

    expect(await screen.findByText("Chair 1")).toBeInTheDocument()
    expect(screen.getByText("Chair 2")).toBeInTheDocument()
    expect(screen.getAllByText("Sukhumvit")).toHaveLength(1)
    expect(screen.queryByText("Dr. Anong")).not.toBeInTheDocument()
    expect(screen.getByTestId(`col-${chairOneId}`)).toContainElement(
      screen.getByTestId(`appt-${inChairOne}`)
    )
    expect(screen.getByTestId(`col-${chairTwoId}`)).toContainElement(
      screen.getByTestId(`appt-${inChairTwo}`)
    )
    expect(screen.queryByTestId("unseated-notice")).not.toBeInTheDocument()
  })

  it("refuses every drag in chair mode because no api can move an appointment between chairs", async () => {
    const id = "a1000000-0000-4000-8000-000000000053"
    const bodies: unknown[] = []
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      chairs(),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          {
            ...appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z"),
            claims: [claim(chairOneId)]
          }
        ])
      ),
      http.patch(`${API}/appointments/${id}`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(
          appointment(id, dentistId, "2026-08-03T03:00:00.000Z", "2026-08-03T04:00:00.000Z")
        )
      })
    )
    mount("receptionist", "/app/timeline?d=2026-08-03&c=chair")

    const card = await screen.findByTestId(`appt-${id}`)
    const readOnly = screen.getByTestId("chair-read-only")
    expect(readOnly).toBeVisible()
    expect(screen.getByRole("radio", { name: "Chairs" })).toContainElement(readOnly)
    expect(screen.getByRole("radiogroup", { name: "Column grouping" })).toHaveAttribute(
      "aria-describedby",
      "chair-layout-description"
    )
    expect(
      screen.getByText("Chair layout is read-only. Open an appointment to move it.")
    ).toHaveClass("sr-only")
    expect(screen.queryByTestId(`resize-${id}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`overlay-${chairOneId}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`overlay-${dentistId}`)).not.toBeInTheDocument()

    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 400, clientY: 704 })
    fireEvent.pointerUp(window)
    expect(screen.getByTestId(`col-${chairOneId}`)).toContainElement(
      screen.getByTestId(`appt-${id}`)
    )

    await userEvent.click(screen.getByRole("radio", { name: "Dentists" }))
    const sameCard = await screen.findByTestId(`appt-${id}`)
    fireEvent.pointerDown(sameCard, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 640 })
    expect(screen.getByTestId("drag-preview")).toBeInTheDocument()
    fireEvent.pointerUp(window)

    await waitFor(() =>
      expect(bodies).toEqual([{ version: 1, startsAt: "2026-08-03T03:00:00.000Z" }])
    )
  })

  it("drops a cancelled appointment from chair view without calling its freed chair a problem", async () => {
    const seated = "a1000000-0000-4000-8000-000000000054"
    const cancelled = "a1000000-0000-4000-8000-000000000055"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      chairs(),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          {
            ...appointment(seated, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z"),
            claims: [claim(chairOneId)]
          },
          {
            ...appointment(
              cancelled,
              dentistId,
              "2026-08-03T04:00:00.000Z",
              "2026-08-03T05:00:00.000Z"
            ),
            status: "cancelled",
            claims: [claim(chairTwoId, "released")]
          }
        ])
      )
    )
    mount("receptionist", "/app/timeline?d=2026-08-03&c=chair")

    expect(await screen.findByTestId(`appt-${seated}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`appt-${cancelled}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId("unseated-notice")).not.toBeInTheDocument()
  })

  it("counts an appointment the chair layout cannot draw instead of dropping it in silence", async () => {
    const seated = "a1000000-0000-4000-8000-000000000056"
    const chairless = "a1000000-0000-4000-8000-000000000057"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      chairs(),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          {
            ...appointment(seated, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z"),
            claims: [claim(chairOneId)]
          },
          appointment(chairless, dentistId, "2026-08-03T04:00:00.000Z", "2026-08-03T05:00:00.000Z")
        ])
      )
    )
    mount("receptionist", "/app/timeline?d=2026-08-03&c=chair")

    expect(await screen.findByTestId(`appt-${seated}`)).toBeInTheDocument()
    expect(screen.queryByTestId(`appt-${chairless}`)).not.toBeInTheDocument()

    expect(screen.getByTestId("unseated-notice")).toHaveTextContent(
      "1 appointment has no chair — hidden from this view."
    )
  })

  it("returns a hidden appointment to the canvas by grouping the day back by dentist", async () => {
    const chairless = "a1000000-0000-4000-8000-000000000058"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      chairs(),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment(chairless, dentistId, "2026-08-03T04:00:00.000Z", "2026-08-03T05:00:00.000Z")
        ])
      )
    )
    mount("receptionist", "/app/timeline?d=2026-08-03&c=chair")

    const notice = await screen.findByTestId("unseated-notice")
    await userEvent.click(within(notice).getByRole("button", { name: "Group by dentist" }))

    expect(await screen.findByTestId(`appt-${chairless}`)).toBeInTheDocument()
    expect(screen.queryByTestId("unseated-notice")).not.toBeInTheDocument()
  })

  it("shades a chair column outside the branch's opening hours instead of reading as open all day", async () => {
    const early = "a1000000-0000-4000-8000-000000000059"
    const inHours = "a1000000-0000-4000-8000-000000000061"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }], [
        {
          id: branchId,
          name: "Sukhumvit",
          openingHours: { ...closedAllWeek, mon: [["10:00", "16:00"]] }
        }
      ]),
      chairs(),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          {
            ...appointment(early, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z"),
            claims: [claim(chairOneId)]
          },
          {
            ...appointment(
              inHours,
              dentistId,
              "2026-08-03T04:00:00.000Z",
              "2026-08-03T05:00:00.000Z"
            ),
            claims: [claim(chairOneId)]
          }
        ])
      )
    )
    mount("receptionist", "/app/timeline?d=2026-08-03&c=chair")

    const column = await screen.findByTestId(`col-${chairOneId}`)
    const closed = within(column).getAllByTestId("offshift")
    expect(closed).toHaveLength(2)
    expect(closed[0]).toHaveStyle({ top: "0px", height: "64px" })
    expect(closed[1]).toHaveStyle({ top: "448px", height: "64px" })
    expect(screen.getByTestId(`resource-load-${chairOneId}`)).toHaveTextContent(
      "2 booked · 5h free"
    )
  })

  it("leaves chair columns unshaded rather than guessing when the branch has no usable hours", async () => {
    const id = "a1000000-0000-4000-8000-000000000060"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      chairs(),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          {
            ...appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z"),
            claims: [claim(chairOneId)]
          }
        ])
      )
    )
    mount("receptionist", "/app/timeline?d=2026-08-03&c=chair")

    const column = await screen.findByTestId(`col-${chairOneId}`)
    expect(within(column).queryByTestId("offshift")).not.toBeInTheDocument()
    expect(screen.getByTestId(`resource-load-${chairOneId}`)).toHaveTextContent(
      "Closed · 1 booked"
    )
  })

  it("names the keys that move a booking when the user asks for help", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount()

    expect(await screen.findByTestId("timeline-page")).toBeInTheDocument()
    await userEvent.keyboard("?")

    const panel = await screen.findByTestId("keyboard-shortcuts")
    expect(within(panel).getByText("Start 15 min earlier")).toBeInTheDocument()
    expect(within(panel).getByText("15 min longer")).toBeInTheDocument()
    expect(within(panel).getByText("Search this schedule")).toBeInTheDocument()

    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByTestId("keyboard-shortcuts")).not.toBeInTheDocument())
  })

  it("leaves an open panel alone rather than stacking the shortcut list on top of it", async () => {
    const id = "a1000000-0000-4000-8000-000000000062"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")
        ])
      )
    )
    mount("receptionist", `/app/timeline?d=2026-08-03&a=${id}`)

    expect(await screen.findByRole("dialog")).toBeInTheDocument()
    await userEvent.keyboard("?")

    expect(screen.queryByTestId("keyboard-shortcuts")).not.toBeInTheDocument()
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
  })

  it("lets a typed question mark stay in the search box instead of opening the shortcut list", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount()

    await userEvent.click(await screen.findByRole("button", { name: "Search this schedule" }))
    const search = await screen.findByRole("combobox", { name: "Search this schedule" })
    await userEvent.type(search, "?")

    expect(search).toHaveValue("?")
    expect(screen.queryByTestId("keyboard-shortcuts")).not.toBeInTheDocument()
  })

  it("opens the shortcut list from the search panel for anyone who never guesses the key", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount()

    await userEvent.click(await screen.findByRole("button", { name: "Search this schedule" }))
    await userEvent.click(await screen.findByTestId("palette-shortcuts"))

    expect(await screen.findByTestId("keyboard-shortcuts")).toBeInTheDocument()
    expect(screen.queryByRole("combobox", { name: "Search this schedule" })).not.toBeInTheDocument()
  })

  it("falls back to a real branch and says so when the link names one that is not there", async () => {
    const missingBranchId = "b1000000-0000-4000-8000-000000000009"
    const requests: string[] = []
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, ({ request }) => {
        requests.push(new URL(request.url).searchParams.get("branchId") ?? "")
        return HttpResponse.json([])
      })
    )
    mount("receptionist", `/app/timeline?d=2026-08-03&b=${missingBranchId}`)

    expect(await screen.findByText("That branch is not available")).toBeInTheDocument()
    expect(screen.getByText(/Showing Sukhumvit instead/)).toBeInTheDocument()
    await waitFor(() => expect(requests.at(-1)).toBe(branchId))
  })

  it("says nothing about the branch when the link names one the clinic really has", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount("receptionist", `/app/timeline?d=2026-08-03&b=${branchId}`)

    expect(await screen.findByTestId("timeline-page")).toBeInTheDocument()
    expect(screen.queryByText("That branch is not available")).not.toBeInTheDocument()
  })

  it("switches the columns back and forth from the toolbar and keeps it in the url", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      chairs(),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount()

    expect(await screen.findByText("Dr. Anong")).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Dentists" })).toHaveAttribute("aria-checked", "true")

    await userEvent.click(screen.getByRole("radio", { name: "Chairs" }))
    expect(await screen.findByText("Chair 1")).toBeInTheDocument()
    expect(screen.queryByText("Dr. Anong")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("radio", { name: "Dentists" }))
    expect(await screen.findByText("Dr. Anong")).toBeInTheDocument()
    expect(screen.getByTestId(`overlay-${dentistId}`)).toBeInTheDocument()
  })

  it("shows a phone booking arrive over realtime, animated and announced, with no reload", async () => {
    const id = "a1000000-0000-4000-8000-000000000031"
    let booked: unknown[] = []
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json(booked))
    )
    mount()
    await screen.findByTestId(`col-${dentistId}`)
    expect(screen.queryByTestId(`appt-${id}`)).not.toBeInTheDocument()

    booked = [appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")]
    act(() => fireSocketEvent("connect"))
    act(() =>
      fireSocketEvent(APPOINTMENT_CHANGED, { appointmentId: id, branchId, action: "created" })
    )

    const card = await screen.findByTestId(`appt-${id}`)
    expect(card.className).toContain("appointment-arrive")
    expect(screen.getByText("A new booking just arrived on this day")).toBeInTheDocument()
    expect(screen.getByRole("status", { name: "Live schedule update" })).toHaveTextContent(
      "1 new appointment"
    )
    expect(screen.getByRole("status", { name: "Live schedule update" })).toHaveTextContent(
      "Mon 3 Aug"
    )
    expect(screen.getByRole("button", { name: "Review updates" }).className).toContain("focus-visible:ring-2")
    await userEvent.click(screen.getByRole("button", { name: "Review updates" }))
    expect(screen.queryByRole("status", { name: "Live schedule update" })).not.toBeInTheDocument()
  })

  it("switches to a week agenda showing every day without the draggable day grid", async () => {
    const requests: { from: string | null; to: string | null }[] = []
    const weekAppointmentId = "a1000000-0000-4000-8000-000000000041"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, ({ request }) => {
        const url = new URL(request.url)
        requests.push({ from: url.searchParams.get("from"), to: url.searchParams.get("to") })
        return HttpResponse.json([
          appointment(
            weekAppointmentId,
            dentistId,
            "2026-08-03T02:00:00.000Z",
            "2026-08-03T03:00:00.000Z"
          )
        ])
      })
    )
    mount()
    expect(await screen.findByText("Dr. Anong")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("radio", { name: "Week" }))

    expect(await screen.findByTestId("weekly-agenda-board")).toBeInTheDocument()
    expect(screen.getByTestId("week-day-2026-08-03")).toBeInTheDocument()
    expect(screen.getByTestId("week-day-2026-08-09")).toBeInTheDocument()
    expect(screen.getByTestId(`week-appt-${weekAppointmentId}`)).toHaveTextContent("S. Chaiwat")
    expect(screen.queryByTestId("timegrid-scroll")).not.toBeInTheDocument()
    expect(screen.queryByTestId(`overlay-${dentistId}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`resize-${weekAppointmentId}`)).not.toBeInTheDocument()
    expect(screen.getByText("Week of Mon 3 Aug")).toBeInTheDocument()
    expect(screen.queryByRole("radio", { name: "Dentists" })).not.toBeInTheDocument()

    await waitFor(() =>
      expect(
        requests.some(
          (r) => r.from && r.to && Date.parse(r.to) - Date.parse(r.from) === 7 * 86_400_000
        )
      ).toBe(true)
    )
  })

  it("opens the command palette with the keyboard shortcut and jumps straight to the picked appointment", async () => {
    const id = "a1000000-0000-4000-8000-000000000040"
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json([
          appointment(id, dentistId, "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z")
        ])
      )
    )
    mount()
    expect(await screen.findByTestId(`appt-${id}`)).toBeInTheDocument()

    await userEvent.keyboard("{Meta>}k{/Meta}")
    expect(await screen.findByPlaceholderText("Search by name, phone, dentist, or chair…")).toBeInTheDocument()

    const results = screen.getByRole("listbox", { name: "Matching appointments" })
    await userEvent.click(within(results).getByText("S. Chaiwat"))
    expect(await screen.findByRole("dialog")).toHaveTextContent("Cleaning")
    expect(
      screen.queryByPlaceholderText("Search by patient name or phone…")
    ).not.toBeInTheDocument()
  })

  it("also opens the command palette from the toolbar's find-a-patient button", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount()
    expect(await screen.findByText("Dr. Anong")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Search this schedule" }))
    expect(await screen.findByPlaceholderText("Search by name, phone, dentist, or chair…")).toBeInTheDocument()
  })

  describe("a clinic with no dentists yet", () => {
    const emptyClinic = (staff: () => unknown[]) => [
      http.get(`${API}/branches`, () =>
        HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {}, timezone: "Asia/Bangkok", isActive: true }])
      ),
      http.get(`${API}/staff`, () => HttpResponse.json(staff())),
      http.get(`${API}/shifts`, () => HttpResponse.json([])),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    ]

    it("shows skeletons, not an empty clinic, while the staff list is still loading", async () => {
      let releaseStaff = () => {}
      const staffArrived = new Promise<void>((resolve) => {
        releaseStaff = resolve
      })
      server.use(
        http.get(`${API}/branches`, () =>
          HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {}, timezone: "Asia/Bangkok", isActive: true }])
        ),
        http.get(`${API}/shifts`, () => HttpResponse.json([])),
        http.get(`${API}/availability`, () => HttpResponse.json({ slots: [] })),
        http.get(`${API}/appointments`, () => HttpResponse.json([])),
        http.get(`${API}/staff`, async () => {
          await staffArrived
          return HttpResponse.json([{ id: dentistId, name: "Dr. Anong", role: "dentist", isActive: true }])
        })
      )
      mount("owner")

      expect(await screen.findByTestId("timeline-loading")).toContainElement(
        screen.getByTestId("timeline-toolbar-skeleton")
      )
      expect(screen.getByTestId("timeline-loading")).toContainElement(
        screen.getByTestId("timeline-grid-skeleton")
      )
      expect(screen.queryByText("No dentists yet")).not.toBeInTheDocument()

      releaseStaff()
      expect(await screen.findByTestId(`overlay-${dentistId}`)).toBeInTheDocument()
      expect(screen.queryByText("No dentists yet")).not.toBeInTheDocument()
    })

    it("tells an owner what to do and offers the doing", async () => {
      let staff: unknown[] = []
      const posted: unknown[] = []
      server.use(
        ...emptyClinic(() => staff),
        http.post(`${API}/staff`, async ({ request }) => {
          posted.push(await request.json())
          staff = [{ id: dentistId, name: "Dr. Anong", role: "dentist", isActive: true }]
          return HttpResponse.json({
            id: dentistId,
            name: "Dr. Anong",
            role: "dentist",
            isActive: true
          })
        })
      )
      mount("owner")

      expect(await screen.findByText("No dentists yet")).toBeInTheDocument()
      expect(
        screen.getByText("Add your first colleague to start building a schedule")
      ).toBeInTheDocument()
      expect(screen.queryByTestId("timegrid-scroll")).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole("button", { name: "Add a colleague" }))
      const dialog = await screen.findByRole("dialog")
      expect(dialog).toHaveTextContent("Add a colleague")

      await userEvent.type(screen.getByLabelText("Name"), "Dr. Anong")
      await userEvent.type(screen.getByLabelText("Email"), "anong@brightsmile.test")
      await userEvent.type(screen.getByLabelText("Password"), "correct-horse")
      await userEvent.click(screen.getByRole("button", { name: "Add colleague" }))

      await waitFor(() =>
        expect(posted).toEqual([
          {
            name: "Dr. Anong",
            email: "anong@brightsmile.test",
            password: "correct-horse",
            role: "dentist"
          }
        ])
      )
      expect(await screen.findByTestId(`col-${dentistId}`)).toBeInTheDocument()
      expect(screen.queryByText("No dentists yet")).not.toBeInTheDocument()
    })

    it("gives a receptionist the same explanation without a button she cannot use", async () => {
      server.use(...emptyClinic(() => []))
      mount("receptionist")

      expect(await screen.findByText("No dentists yet")).toBeInTheDocument()
      expect(
        screen.getByText("Add your first colleague to start building a schedule")
      ).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Add a colleague" })).not.toBeInTheDocument()
    })

    it("withdraws the add affordance while the browser is offline", async () => {
      server.use(...emptyClinic(() => []))
      mount("owner")

      await screen.findByText("No dentists yet")
      const add = screen.getByRole("button", { name: "Add a colleague" })
      expect(add).toBeEnabled()

      goOffline()
      expect(screen.getByRole("button", { name: "Add a colleague" })).toBeDisabled()
      expect(screen.getByRole("button", { name: "Add a colleague" })).toHaveAccessibleDescription(
        /offline/
      )

      goOnline()
      expect(screen.getByRole("button", { name: "Add a colleague" })).toBeEnabled()
    })

    it("never shows the first-run prompt to the seeded demo clinic", async () => {
      server.use(
        ...directory([
          { id: dentistId, name: "Somchai Wattana" },
          { id: otherDentistId, name: "Ploy Siriwan" }
        ]),
        http.get(`${API}/appointments`, () => HttpResponse.json([]))
      )
      mount("owner")

      expect(await screen.findByTestId(`col-${dentistId}`)).toBeInTheDocument()
      expect(screen.queryByText("No dentists yet")).not.toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Add a colleague" })).not.toBeInTheDocument()
    })
  })
})
