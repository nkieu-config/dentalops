import type { UserRole } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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

const directory = (dentists: { id: string; name: string }[]) => [
  http.get(`${API}/branches`, () =>
    HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {} }])
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

  it("keeps the grid usable and offers a retry when only appointments fail to load", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      http.get(`${API}/appointments`, () =>
        HttpResponse.json({ statusCode: 500, errorCode: "INTERNAL", message: "boom", requestId: "r" }, { status: 500 })
      )
    )
    mount()

    expect(await screen.findByText("Dr. Anong")).toBeInTheDocument()
    expect(await screen.findByText("Appointments could not be loaded")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
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
    expect(within(dialog).getByLabelText("Dentist")).toHaveValue(dentistId)
    expect(within(dialog).getByLabelText("Starts")).toHaveValue("09:00")
  })

  it("opens a prefilled booking drawer from the toolbar button, with no pointer gesture at all", async () => {
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
    expect(within(dialog).getByLabelText("Dentist")).toHaveValue(dentistId)
    expect(within(dialog).getByLabelText("Starts")).toHaveValue("09:00")
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
    expect(card.className).toContain("z-[5]")
    expect(overlay.className).not.toMatch(/(^|\s)z-/)

    fireEvent.pointerDown(card, { clientY: 576, button: 0 })
    fireEvent.pointerMove(card, { clientY: 578 })
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
    expect(preview).toHaveStyle({ top: "640px", height: "64px" })
    expect(preview.className).toContain("shadow-lg")
    expect(card.className).toContain("opacity-40")
    const grid = screen.getByTestId("timegrid-scroll")
    expect([...grid.querySelectorAll('[class*="shadow"]')]).toEqual([preview])

    fireEvent.pointerUp(window)
    expect(screen.queryByTestId("drag-preview")).not.toBeInTheDocument()
    await waitFor(() =>
      expect(bodies).toEqual([{ version: 1, startsAt: "2026-08-03T03:00:00.000Z" }])
    )
    await waitFor(() =>
      expect(screen.getByTestId(`appt-${id}`)).toHaveStyle({ top: "640px", height: "64px" })
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("snaps a rejected drag back and rings the appointment it collided with", async () => {
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
    expect(screen.getByTestId(`appt-${moving}`)).toHaveStyle({ top: "576px" })
    const blocked = screen.getByTestId(`appt-${blocker}`)
    expect(blocked.className).toContain("ring-2")
    expect(blocked.className).toContain("ring-destructive")
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
    await waitFor(() => expect(screen.getByTestId(`appt-${id}`)).toHaveStyle({ top: "592px" }))
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
    await userEvent.click(await screen.findByRole("button", { name: "12:00" }))

    await waitFor(() =>
      expect(bodies).toEqual([{ version: 1, startsAt: "2026-08-03T05:00:00.000Z" }])
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId(`appt-${id}`)).toHaveStyle({ top: "768px" }))
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
    expect(screen.queryByTestId(`resize-${id}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`overlay-${chairOneId}`)).not.toBeInTheDocument()
    expect(screen.queryByTestId(`overlay-${dentistId}`)).not.toBeInTheDocument()

    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 400, clientY: 704 })
    fireEvent.pointerUp(window)
    expect(screen.getByTestId(`col-${chairOneId}`)).toContainElement(
      screen.getByTestId(`appt-${id}`)
    )

    await userEvent.selectOptions(screen.getByLabelText("Column grouping"), "dentist")
    const sameCard = await screen.findByTestId(`appt-${id}`)
    fireEvent.pointerDown(sameCard, { button: 0, clientX: 10, clientY: 576 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 640 })
    expect(screen.getByTestId("drag-preview")).toBeInTheDocument()
    fireEvent.pointerUp(window)

    await waitFor(() =>
      expect(bodies).toEqual([{ version: 1, startsAt: "2026-08-03T03:00:00.000Z" }])
    )
  })

  it("says an appointment is missing rather than letting a released chair swallow it", async () => {
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
    const notice = screen.getByTestId("unseated-notice")
    expect(notice).toHaveTextContent("1 appointment is hidden here")
    expect(notice).toHaveTextContent("Switch to dentist columns to see it")
  })

  it("switches the columns back and forth from the toolbar and keeps it in the url", async () => {
    server.use(
      ...directory([{ id: dentistId, name: "Dr. Anong" }]),
      chairs(),
      http.get(`${API}/appointments`, () => HttpResponse.json([]))
    )
    mount()

    expect(await screen.findByText("Dr. Anong")).toBeInTheDocument()
    const toggle = screen.getByLabelText("Column grouping")
    expect(toggle).toHaveValue("dentist")

    await userEvent.selectOptions(toggle, "chair")
    expect(await screen.findByText("Chair 1")).toBeInTheDocument()
    expect(screen.queryByText("Dr. Anong")).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText("Column grouping"), "dentist")
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
  })

  describe("a clinic with no dentists yet", () => {
    const emptyClinic = (staff: () => unknown[]) => [
      http.get(`${API}/branches`, () =>
        HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {} }])
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
          HttpResponse.json([{ id: branchId, name: "Sukhumvit", openingHours: {} }])
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

      await new Promise((resolve) => setTimeout(resolve, 150))
      expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0)
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
