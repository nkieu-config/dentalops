import type { UserRole } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { Toaster, toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PHONE_ERROR } from "../../lib/phone"
import { setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { PatientDetail } from "./patient-detail"

const tenantId = "9f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const patientId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const branchId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const secondBranchId = "7f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "3f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "4f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const appointmentOne = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const appointmentTwo = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const appointment = (
  id: string,
  startsAt: string,
  status: string,
  branch = { id: branchId, name: "Ladprao" }
) => ({
  id,
  branchId: branch.id,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 45 * 60_000).toISOString(),
  status,
  branch,
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

const mount = (entry = `/app/patients/${patientId}`, role: UserRole = "owner") => {
  setSession({
    accessToken: "t1",
    user: { id: "u1", tenantId, name: "Malee Owner", role }
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/app/patients/:id" element={<PatientDetail />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>
  )
  return userEvent.setup()
}

describe("PatientDetail", () => {
  afterEach(() => {
    vi.useRealTimers()
    toast.dismiss()
  })

  it("shows booking and editing actions only to roles allowed to manage appointments", async () => {
    server.use(http.get(`${API}/patients/${patientId}`, () => HttpResponse.json(detail([]))))

    mount(`/app/patients/${patientId}`, "dentist")

    expect(await screen.findByRole("heading", { name: "Kanya Wongchai" })).toBeVisible()
    expect(screen.queryByRole("button", { name: "Edit patient" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "New appointment" })).not.toBeInTheDocument()
  })

  it("shows how to reach the patient and what they have booked", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-12T12:00:00+07:00"))
    server.use(
      http.get(`${API}/patients/${patientId}`, () =>
        HttpResponse.json(
          detail([
            appointment(appointmentOne, "2026-08-13T03:30:00.000Z", "confirmed"),
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

    const upcoming = screen.getByRole("list", { name: "Next appointment" })
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
          detail([appointment(appointmentOne, "2026-08-13T20:30:00.000Z", "confirmed")])
        )
      )
    )
    mount()

    const row = (await screen.findAllByRole("listitem"))[0]!
    expect(within(row).getByRole("link")).toHaveAttribute(
      "href",
      `/app/timeline?d=2026-08-14&b=${branchId}&a=${appointmentOne}`
    )
  })

  it("uses a mobile-safe information grid instead of allowing appointment metadata to overlap", async () => {
    server.use(
      http.get(`${API}/patients/${patientId}`, () =>
        HttpResponse.json(
          detail([appointment(appointmentOne, "2026-07-13T20:30:00.000Z", "completed")])
        )
      )
    )
    mount()

    const row = (await screen.findAllByRole("listitem"))[0]!
    const link = within(row).getByRole("link")
    expect(link).toHaveClass("grid")
    expect(link).not.toHaveClass("flex-wrap")
    expect(within(row).getByTestId("appointment-primary")).toHaveClass("min-w-0")
    expect(within(row).getByTestId("appointment-context")).toHaveClass("break-words")
    expect(within(row).getByTestId("appointment-context")).toHaveClass("sm:col-start-2")
    expect(within(row).getByTestId("appointment-disclosure")).toHaveClass("sm:col-start-4")
  })

  it("puts the nearest future booking first and shows branch context only when it differs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-12T12:00:00+07:00"))
    server.use(
      http.get(`${API}/patients/${patientId}`, () =>
        HttpResponse.json(
          detail([
            appointment(appointmentOne, "2026-09-03T03:30:00.000Z", "confirmed"),
            appointment(appointmentTwo, "2026-08-14T03:30:00.000Z", "confirmed", {
              id: secondBranchId,
              name: "Rama 9"
            })
          ])
        )
      )
    )
    mount()

    const next = await screen.findByRole("list", { name: "Next appointment" })
    expect(within(next).getAllByRole("listitem")).toHaveLength(1)
    expect(next).toHaveTextContent("Fri, 14 Aug 2026")
    expect(next).toHaveTextContent("Rama 9")
    expect(screen.getByRole("list", { name: "More upcoming" })).toHaveTextContent("Thu, 3 Sept 2026")
    expect(screen.getByText("Ladprao")).toBeInTheDocument()
  })

  it("treats a confirmed appointment in the past as previous rather than upcoming", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-12T12:00:00+07:00"))
    server.use(
      http.get(`${API}/patients/${patientId}`, () =>
        HttpResponse.json(
          detail([
            appointment(appointmentOne, "2026-08-11T03:30:00.000Z", "confirmed"),
            appointment(appointmentTwo, "2026-08-13T03:30:00.000Z", "confirmed")
          ])
        )
      )
    )
    mount()

    const next = await screen.findByRole("list", { name: "Next appointment" })
    const previous = screen.getByRole("list", { name: "Previous" })
    expect(next).toHaveTextContent("Thu, 13 Aug 2026")
    expect(previous).toHaveTextContent("Tue, 11 Aug 2026")
  })

  it("keeps the patient summary actionable for editing and booking", async () => {
    server.use(http.get(`${API}/patients/${patientId}`, () => HttpResponse.json(detail([]))))
    mount()

    const summary = await screen.findByTestId("patient-summary")
    expect(within(summary).getByRole("link", { name: "New appointment" })).toHaveAttribute(
      "href",
      `/app/timeline?new=appointment&p=${patientId}`
    )
    expect(within(summary).getByRole("button", { name: "Edit patient" })).toBeInTheDocument()
    expect(within(summary).getByTestId("patient-mobile-book-label")).toHaveTextContent("Book")
    expect(within(summary).getByTestId("patient-mobile-edit-label")).toHaveTextContent("Edit")
    const contacts = within(summary).getByTestId("patient-contact-panel")
    expect(contacts).toHaveTextContent("Phone")
    expect(contacts).toHaveTextContent("Email")
  })

  it("shows a patient with no email on file instead of a broken mailto link", async () => {
    server.use(
      http.get(`${API}/patients/${patientId}`, () => HttpResponse.json({ ...detail([]), email: "" }))
    )
    mount()

    const summary = await screen.findByTestId("patient-summary")
    const contacts = within(summary).getByTestId("patient-contact-panel")
    expect(contacts).toHaveTextContent("Not on file")
    expect(within(contacts).queryByRole("link", { name: /@/ })).not.toBeInTheDocument()
  })

  it("lets staff save a phone-only edit for a patient with no email, without being forced to invent one", async () => {
    let patched: unknown
    server.use(
      http.get(`${API}/patients/${patientId}`, () => HttpResponse.json({ ...detail([]), email: "" })),
      http.patch(`${API}/patients/${patientId}`, async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json({ ...detail([]), email: "", phone: "0899999999" })
      })
    )
    const user = mount()
    await user.click(await screen.findByRole("button", { name: "Edit patient" }))
    expect(screen.getByLabelText("Email (optional)")).not.toBeRequired()
    await user.clear(screen.getByLabelText("Phone"))
    await user.type(screen.getByLabelText("Phone"), "0899999999")
    await user.click(screen.getByRole("button", { name: "Save patient" }))

    expect(patched).toMatchObject({ phone: "0899999999", email: "" })
    expect(await screen.findByText("Patient details updated")).toBeVisible()
  })

  it("summarizes visit history right under the name so front desk sees it at a glance", async () => {
    server.use(
      http.get(`${API}/patients/${patientId}`, () =>
        HttpResponse.json(
          detail([
            appointment(appointmentOne, "2026-06-01T03:00:00.000Z", "completed"),
            appointment(appointmentTwo, "2026-06-08T03:00:00.000Z", "completed"),
            appointment("7f9619ff-8b86-4d01-b42d-00cf4fc964ff", "2026-06-15T03:00:00.000Z", "no_show")
          ])
        )
      )
    )
    mount()

    const stats = await screen.findByTestId("patient-visit-stats")
    expect(stats).toHaveTextContent("2 visits · 1 no-show")
  })

  it("omits the visit summary for a patient with no appointment history", async () => {
    server.use(http.get(`${API}/patients/${patientId}`, () => HttpResponse.json(detail([]))))
    mount()

    await screen.findByRole("heading", { name: "Kanya Wongchai" })
    expect(screen.queryByTestId("patient-visit-stats")).not.toBeInTheDocument()
  })

  it("makes the next appointment a distinct action-oriented spotlight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-12T12:00:00+07:00"))
    server.use(
      http.get(`${API}/patients/${patientId}`, () =>
        HttpResponse.json(
          detail([appointment(appointmentOne, "2026-08-13T03:30:00.000Z", "confirmed")])
        )
      )
    )
    mount()

    const spotlight = await screen.findByTestId("next-appointment-spotlight")
    expect(spotlight).toHaveTextContent("Next appointment")
    expect(within(spotlight).getByRole("link", { name: /View on timeline/ })).toHaveAttribute(
      "href",
      `/app/timeline?d=2026-08-13&b=${branchId}&a=${appointmentOne}`
    )
  })

  it("updates patient details from the edit sheet", async () => {
    let patched: unknown
    server.use(
      http.get(`${API}/patients/${patientId}`, () => HttpResponse.json(detail([]))),
      http.patch(`${API}/patients/${patientId}`, async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json({
          id: patientId,
          name: "Kanya Saelim",
          phone: "0899999999",
          email: "kanya.saelim@example.com",
          notes: "Needs a morning call"
        })
      })
    )
    const user = mount()
    await user.click(await screen.findByRole("button", { name: "Edit patient" }))
    await user.clear(screen.getByLabelText("Patient name"))
    await user.type(screen.getByLabelText("Patient name"), "Kanya Saelim")
    await user.clear(screen.getByLabelText("Phone"))
    await user.type(screen.getByLabelText("Phone"), "0899999999")
    await user.clear(screen.getByLabelText("Email (optional)"))
    await user.type(screen.getByLabelText("Email (optional)"), "kanya.saelim@example.com")
    await user.type(screen.getByLabelText("Front-desk note (optional)"), "Needs a morning call")
    await user.click(screen.getByRole("button", { name: "Save patient" }))

    expect(patched).toEqual({
      name: "Kanya Saelim",
      phone: "0899999999",
      email: "kanya.saelim@example.com",
      notes: "Needs a morning call"
    })
    expect(await screen.findByRole("heading", { name: "Kanya Saelim" })).toBeInTheDocument()
    expect(screen.getByText("Needs a morning call")).toBeInTheDocument()
    expect(await screen.findByText("Patient details updated")).toBeVisible()
  })

  it("reveals a long upcoming history progressively", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-08-12T12:00:00+07:00"))
    const upcoming = Array.from({ length: 7 }, (_, index) =>
      appointment(
        `${String(index + 10).padStart(2, "0")}9619ff-8b86-4d01-b42d-00cf4fc964ff`,
        new Date(Date.parse("2026-08-13T03:30:00.000Z") + index * 86_400_000).toISOString(),
        "confirmed"
      )
    )
    server.use(http.get(`${API}/patients/${patientId}`, () => HttpResponse.json(detail(upcoming))))
    const user = mount()

    const more = await screen.findByRole("list", { name: "More upcoming" })
    expect(within(more).getAllByRole("listitem")).toHaveLength(3)
    await user.click(screen.getByRole("button", { name: "Show all 6 upcoming" }))
    expect(within(more).getAllByRole("listitem")).toHaveLength(6)
  })

  it("keeps previous and missed appointment history progressive", async () => {
    const previous = Array.from({ length: 7 }, (_, index) =>
      appointment(
        `${String(index + 20).padStart(2, "0")}9619ff-8b86-4d01-b42d-00cf4fc964ff`,
        new Date(Date.parse("2026-07-01T03:30:00.000Z") - index * 86_400_000).toISOString(),
        "completed"
      )
    )
    const missed = Array.from({ length: 6 }, (_, index) =>
      appointment(
        `${String(index + 30).padStart(2, "0")}9619ff-8b86-4d01-b42d-00cf4fc964ff`,
        new Date(Date.parse("2026-06-01T03:30:00.000Z") - index * 86_400_000).toISOString(),
        index % 2 === 0 ? "cancelled" : "no_show"
      )
    )
    server.use(
      http.get(`${API}/patients/${patientId}`, () => HttpResponse.json(detail([...previous, ...missed])))
    )
    const user = mount()

    const previousList = await screen.findByRole("list", { name: "Previous" })
    const missedList = screen.getByRole("list", { name: "Cancelled / No-show" })
    expect(within(previousList).getAllByRole("listitem")).toHaveLength(5)
    expect(within(missedList).getAllByRole("listitem")).toHaveLength(3)

    await user.click(screen.getByRole("button", { name: "Show all 7 previous" }))
    await user.click(screen.getByRole("button", { name: "Show all 6 cancelled or no-show" }))
    expect(within(previousList).getAllByRole("listitem")).toHaveLength(7)
    expect(within(missedList).getAllByRole("listitem")).toHaveLength(6)
  })

  it("explains the phone format inline before submitting an invalid edit", async () => {
    server.use(http.get(`${API}/patients/${patientId}`, () => HttpResponse.json(detail([]))))
    const user = mount()
    await user.click(await screen.findByRole("button", { name: "Edit patient" }))

    expect(screen.getByLabelText("Phone")).toHaveAttribute("placeholder", "0812345678")
    await user.clear(screen.getByLabelText("Phone"))
    await user.type(screen.getByLabelText("Phone"), "123")
    await user.click(screen.getByRole("button", { name: "Save patient" }))

    expect(screen.getByRole("alert")).toHaveTextContent(PHONE_ERROR)
    expect(screen.getByLabelText("Phone")).toHaveFocus()
  })

  it("takes a phone number written the way people write it down", async () => {
    let patched: unknown = null
    server.use(
      http.get(`${API}/patients/${patientId}`, () => HttpResponse.json(detail([]))),
      http.patch(`${API}/patients/${patientId}`, async ({ request }) => {
        patched = await request.json()
        return HttpResponse.json({ ...detail([]), phone: "0899999999" })
      })
    )
    const user = mount()
    await user.click(await screen.findByRole("button", { name: "Edit patient" }))
    await user.clear(screen.getByLabelText("Phone"))
    await user.type(screen.getByLabelText("Phone"), "089-999 9999")
    await user.click(screen.getByRole("button", { name: "Save patient" }))

    await waitFor(() => expect(patched).toMatchObject({ phone: "0899999999" }))
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

  it("says so when the patient cannot be loaded, and a retry actually recovers it", async () => {
    server.use(
      http.get(`${API}/patients/${patientId}`, () =>
        HttpResponse.json(
          { statusCode: 404, errorCode: "NOT_FOUND", message: "Patient not found", requestId: "r" },
          { status: 404 }
        )
      )
    )
    const user = mount()

    expect(await screen.findByText("Could not load this patient")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to patients" })).toBeInTheDocument()

    server.use(
      http.get(`${API}/patients/${patientId}`, () => HttpResponse.json(detail([])))
    )
    await user.click(screen.getByRole("button", { name: "Retry" }))

    expect(await screen.findByRole("heading", { name: "Kanya Wongchai" })).toBeInTheDocument()
    expect(screen.queryByText("Could not load this patient")).not.toBeInTheDocument()
  })
})
