import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { describe, expect, it } from "vitest"
import { setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { PatientDetail } from "./patient-detail"

const tenantId = "9f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const patientId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const branchId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "3f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "4f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const appointmentOne = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const appointmentTwo = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const appointment = (id: string, startsAt: string, status: string) => ({
  id,
  branchId,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 45 * 60_000).toISOString(),
  status,
  service: { id: serviceId, name: "Cleaning" },
  dentist: { id: dentistId, name: "Dr. Anong" }
})

const detail = (appointments: ReturnType<typeof appointment>[]) => ({
  id: patientId,
  name: "Kanya Wongchai",
  phone: "0812345678",
  email: "kanya@example.com",
  notes: null,
  appointments
})

const mount = (entry = `/app/patients/${patientId}`) => {
  setSession({
    accessToken: "t1",
    user: { id: "u1", tenantId, name: "Malee Owner", role: "owner" }
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/app/patients/:id" element={<PatientDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("PatientDetail", () => {
  it("shows how to reach the patient and what they have booked", async () => {
    server.use(
      http.get(`${API}/patients/${patientId}`, () =>
        HttpResponse.json(
          detail([
            appointment(appointmentOne, "2026-08-03T03:30:00.000Z", "confirmed"),
            appointment(appointmentTwo, "2026-07-01T07:00:00.000Z", "no_show")
          ])
        )
      )
    )
    mount()

    expect(await screen.findByRole("heading", { name: "Kanya Wongchai" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "0812345678" })).toHaveAttribute(
      "href",
      "tel:0812345678"
    )
    expect(screen.getByRole("link", { name: "kanya@example.com" })).toHaveAttribute(
      "href",
      "mailto:kanya@example.com"
    )

    const upcoming = screen.getByRole("list", { name: "Upcoming" })
    const cancelled = screen.getByRole("list", { name: "Cancelled / No-show" })
    
    expect(within(upcoming).getAllByRole("listitem")).toHaveLength(1)
    expect(upcoming).toHaveTextContent("Cleaning")
    expect(upcoming).toHaveTextContent("Dr. Anong")
    expect(upcoming).toHaveTextContent("10:30")
    expect(upcoming).toHaveTextContent("Confirmed")
    
    expect(within(cancelled).getAllByRole("listitem")).toHaveLength(1)
    expect(cancelled).toHaveTextContent("No-show")
  })

  it("links every appointment to the timeline on its own day and branch", async () => {
    server.use(
      http.get(`${API}/patients/${patientId}`, () =>
        HttpResponse.json(
          detail([appointment(appointmentOne, "2026-08-03T20:30:00.000Z", "confirmed")])
        )
      )
    )
    mount()

    const row = (await screen.findAllByRole("listitem"))[0]!
    expect(within(row).getByRole("link")).toHaveAttribute(
      "href",
      `/app/timeline?d=2026-08-04&b=${branchId}`
    )
  })

  it("carries the search back to the list", async () => {
    server.use(http.get(`${API}/patients/${patientId}`, () => HttpResponse.json(detail([]))))
    mount(`/app/patients/${patientId}?q=kanya`)

    expect(await screen.findByRole("link", { name: "Back to patients" })).toHaveAttribute(
      "href",
      "/app/patients?q=kanya"
    )
  })

  it("says the patient has no history rather than drawing an empty list", async () => {
    server.use(http.get(`${API}/patients/${patientId}`, () => HttpResponse.json(detail([]))))
    mount()

    expect(await screen.findByText("No appointments yet")).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: "Upcoming" })).not.toBeInTheDocument()
  })

  it("says so when the patient cannot be loaded", async () => {
    server.use(
      http.get(`${API}/patients/${patientId}`, () =>
        HttpResponse.json(
          { statusCode: 404, errorCode: "NOT_FOUND", message: "Patient not found", requestId: "r" },
          { status: 404 }
        )
      )
    )
    mount()

    expect(await screen.findByText("Could not load this patient")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to patients" })).toBeInTheDocument()
  })
})
