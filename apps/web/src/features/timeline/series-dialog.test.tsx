import type { Appointment } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Toaster, toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API, http, HttpResponse, server } from "../../test/msw"
import { SeriesDialog } from "./series-dialog"

const appointmentId = "4f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const seriesId = "c1000000-0000-4000-8000-000000000001"
const dentistId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const appointment: Appointment = {
  id: appointmentId,
  branchId: "1f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  serviceId: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  dentistId,
  patientId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  startsAt: "2026-08-03T02:00:00.000Z",
  endsAt: "2026-08-03T03:00:00.000Z",
  status: "confirmed",
  version: 4,
  seriesId,
  service: { id: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Cleaning", colorIndex: 0 },
  patient: { id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "S. Chaiwat", phone: "0812345678" },
  claims: []
}

const slots = () =>
  HttpResponse.json({
    slots: [
      { dentistId, startsAt: "2026-08-03T04:00:00.000Z", endsAt: "2026-08-03T05:00:00.000Z" },
      { dentistId, startsAt: "2026-08-03T06:00:00.000Z", endsAt: "2026-08-03T07:00:00.000Z" }
    ]
  })

const mount = () => {
  const onClose = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <SeriesDialog appointment={appointment} onClose={onClose} />
      <Toaster />
    </QueryClientProvider>
  )
  return { onClose }
}

afterEach(() => toast.dismiss())

describe("SeriesDialog", () => {
  it("requires confirming the selected slot before moving an occurrence", async () => {
    const bodies: unknown[] = []
    server.use(
      http.get(`${API}/availability`, slots),
      http.patch(`${API}/series/${seriesId}`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ seriesId, appointments: [] })
      })
    )
    const { onClose } = mount()

    expect(screen.getByLabelText("This appointment")).toBeChecked()
    await userEvent.click(await screen.findByRole("button", { name: "11:00" }))

    expect(bodies).toEqual([])
    await userEvent.click(screen.getByRole("button", { name: "Confirm move" }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({
      scope: "this",
      fromAppointmentId: appointmentId,
      version: 4,
      startsAt: "2026-08-03T04:00:00.000Z"
    })
    expect(await screen.findByText("Occurrence moved")).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it("carries the chosen scope through to the series patch", async () => {
    const bodies: unknown[] = []
    server.use(
      http.get(`${API}/availability`, slots),
      http.patch(`${API}/series/${seriesId}`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ seriesId, appointments: [] })
      })
    )
    mount()

    await userEvent.click(screen.getByLabelText("This and following"))
    await userEvent.click(await screen.findByRole("button", { name: "13:00" }))
    await userEvent.click(screen.getByRole("button", { name: "Confirm move" }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toMatchObject({ scope: "following", startsAt: "2026-08-03T06:00:00.000Z" })
    expect(await screen.findByText("Series moved")).toBeInTheDocument()
  })

  it("names every conflicting occurrence and keeps the dialog open", async () => {
    server.use(
      http.get(`${API}/availability`, slots),
      http.patch(`${API}/series/${seriesId}`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            errorCode: "SERIES_CONFLICT",
            message: "Some occurrences conflict",
            details: {
              conflicts: [{ startsAt: "2026-08-17T04:00:00.000Z", reason: "SLOT_CONFLICT" }]
            },
            requestId: "r"
          },
          { status: 409 }
        )
      )
    )
    const { onClose } = mount()

    await userEvent.click(screen.getByLabelText("All appointments"))
    await userEvent.click(await screen.findByRole("button", { name: "11:00" }))
    await userEvent.click(screen.getByRole("button", { name: "Confirm move" }))

    const list = await screen.findByTestId("series-conflicts")
    expect(list).toHaveTextContent("1 occurrence conflicts")
    expect(list).toHaveTextContent("Mon, 17 Aug 2026 11:00 — the dentist is already booked")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
