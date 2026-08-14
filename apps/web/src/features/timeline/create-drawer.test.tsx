import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Toaster, toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API, http, HttpResponse, server } from "../../test/msw"
import { CreateDrawer, type CreateDraft } from "./create-drawer"
import { bkkDayStart } from "./lib/geometry"

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const cleaningId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const whiteningId = "5f9619ff-8b86-4d01-b42d-00cf4fc964fe"
const patientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const linkedPatientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964fd"
const seriesId = "c1000000-0000-4000-8000-000000000001"

const dentist = { id: dentistId, name: "Dr. Anong", role: "dentist" as const, isActive: true }
const dayStart = bkkDayStart("2026-08-03")

const draft: CreateDraft = {
  dentist,
  branchId,
  startsAt: dayStart + 9 * 3_600_000
}

const directoryHandlers = () => [
  http.get(`${API}/services`, () =>
    HttpResponse.json([
      {
        id: cleaningId,
        name: "Cleaning",
        durationMin: 30,
        bufferMin: 10,
        colorIndex: 0,
        isActive: true
      },
      {
        id: whiteningId,
        name: "Whitening",
        durationMin: 60,
        bufferMin: 10,
        colorIndex: 4,
        isActive: true
      }
    ])
  ),
  http.get(`${API}/patients`, () =>
    HttpResponse.json({
      items: [
        { id: patientId, name: "S. Chaiwat", phone: "0812345678", nextAppointmentAt: null },
        { id: "6f9619ff-8b86-4d01-b42d-00cf4fc964fe", name: "N. Pornthip", phone: "0898765432", nextAppointmentAt: null }
      ],
      nextCursor: null
    })
  )
]

const patientRows = Array.from({ length: 6 }, (_, index) => ({
  id: `6f9619ff-8b86-4d01-b42d-00cf4fc964f${index}`,
  name: `Patient ${index + 1}`,
  phone: `081234567${index}`,
  nextAppointmentAt: null
}))

const mount = ({
  createDraft = draft,
  initialPatientId,
  onClose = () => {}
}: {
  createDraft?: CreateDraft
  initialPatientId?: string
  onClose?: () => void
} = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CreateDrawer
        draft={createDraft}
        dentists={[dentist]}
        dayStart={dayStart}
        branchName="Ladprao"
        initialPatientId={initialPatientId}
        onClose={onClose}
      />
      <Toaster />
    </QueryClientProvider>
  )
}

const chooseService = async () => {
  await userEvent.click(await screen.findByLabelText("Service"))
  await userEvent.click(await screen.findByRole("option", { name: /Whitening/ }))
}

const fillForm = async () => {
  await chooseService()
  await userEvent.click(await screen.findByRole("button", { name: /S\. Chaiwat/ }))
}

afterEach(() => toast.dismiss())

describe("CreateDrawer", () => {
  it("preselects the patient supplied by a patient-record booking action", async () => {
    server.use(
      ...directoryHandlers(),
      http.get(`${API}/patients/${linkedPatientId}`, () =>
        HttpResponse.json({
          id: linkedPatientId,
          name: "Linked Patient",
          phone: "0866666666",
          email: "linked@example.com",
          notes: null,
          appointments: []
        })
      )
    )

    mount({ initialPatientId: linkedPatientId })

    expect(await screen.findByText("Linked Patient")).toBeVisible()
    expect(screen.getByText("0866666666")).toBeVisible()
  })

  it("posts the drafted slot with the chosen service and patient", async () => {
    const bodies: unknown[] = []
    server.use(
      ...directoryHandlers(),
      http.post(`${API}/appointments`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({
          id: "4f9619ff-8b86-4d01-b42d-00cf4fc964ff",
          branchId,
          serviceId: whiteningId,
          dentistId,
          patientId,
          startsAt: "2026-08-03T02:00:00.000Z",
          endsAt: "2026-08-03T03:00:00.000Z",
          status: "confirmed",
          version: 1,
          seriesId: null,
          service: { id: whiteningId, name: "Whitening", colorIndex: 4 },
          patient: { id: patientId, name: "S. Chaiwat", phone: "0812345678" },
          claims: []
        })
      })
    )
    mount()
    expect(screen.getByTestId("create-date-context")).toHaveTextContent("Mon, 3 Aug 2026")
    expect(screen.getByLabelText("Dentist")).toHaveTextContent("Dr. Anong")
    expect(screen.getByLabelText("Starts")).toHaveValue("09:00")
    expect(screen.getByLabelText("Starts")).toHaveAttribute("name", "startsAt")
    expect(screen.getByLabelText("Starts")).toHaveAttribute("autocomplete", "off")
    expect(screen.getByLabelText("Patient")).toHaveAttribute("name", "patientSearch")
    expect(screen.getByLabelText("Patient")).toHaveAttribute("autocomplete", "off")

    const patientOption = await screen.findByRole("button", { name: /S\. Chaiwat/ })
    expect(patientOption.className).toContain("min-h-11")
    expect(screen.getByText("0812345678")).toHaveClass("mt-0.5")

    await fillForm()
    await userEvent.click(screen.getByRole("button", { name: "Book appointment" }))

    expect(await screen.findByText("Appointment booked")).toBeInTheDocument()
    expect(bodies).toEqual([
      {
        serviceId: whiteningId,
        dentistId,
        patientId,
        branchId,
        startsAt: "2026-08-03T02:00:00.000Z"
      }
    ])
  })

  it("keeps the drawer and the entered choices when the slot conflicts", async () => {
    server.use(
      ...directoryHandlers(),
      http.post(`${API}/appointments`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            errorCode: "SLOT_CONFLICT",
            message: "Dentist is already booked at this time",
            requestId: "r"
          },
          { status: 409 }
        )
      )
    )
    mount()
    await fillForm()
    await userEvent.click(screen.getByRole("button", { name: "Book appointment" }))

    const dialog = screen.getByRole("dialog")
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Dentist is already booked at this time"
    )
    expect(screen.getByLabelText("Service")).toHaveTextContent("Whitening · 60 min")
    expect(screen.getByRole("button", { name: /S\. Chaiwat/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByRole("button", { name: "Book appointment" })).toBeEnabled()
  })

  it("cannot be submitted until both a service and a patient are chosen", async () => {
    server.use(...directoryHandlers())
    mount()
    await screen.findByRole("button", { name: /S\. Chaiwat/ })
    await screen.findByLabelText("Service")
    expect(screen.getByRole("button", { name: "Book appointment" })).toBeDisabled()

    await chooseService()
    expect(screen.getByRole("button", { name: "Book appointment" })).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: /S\. Chaiwat/ }))
    expect(screen.getByRole("button", { name: "Book appointment" })).toBeEnabled()
  })

  it("shows the five most recent patients until a search query is entered", async () => {
    server.use(
      http.get(`${API}/patients`, ({ request }) => {
        const query = new URL(request.url).searchParams.get("q")
        return HttpResponse.json({ items: query ? patientRows : patientRows, nextCursor: null })
      }),
      http.get(`${API}/services`, () => HttpResponse.json([]))
    )
    mount()

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /081234567/ })).toHaveLength(5)
    )
    expect(screen.getByRole("listbox", { name: "Patient results" })).not.toHaveClass(
      "overflow-y-auto"
    )

    await userEvent.type(screen.getByLabelText("Patient"), "Patient")
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /081234567/ })).toHaveLength(6)
    )
  })

  it("books a weekly series from the repeat section, defaulting to the drafted weekday", async () => {
    const bodies: unknown[] = []
    server.use(
      ...directoryHandlers(),
      http.post(`${API}/appointments/series`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ seriesId: seriesId, appointments: [] }, { status: 201 })
      })
    )
    mount()
    await fillForm()

    await userEvent.click(screen.getByLabelText("Repeat weekly"))
    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Tue" })).toHaveAttribute("aria-pressed", "false")

    await userEvent.click(screen.getByRole("button", { name: "Wed" }))
    fireEvent.change(screen.getByLabelText("Occurrences"), { target: { value: "6" } })
    await userEvent.click(screen.getByRole("button", { name: "Book series" }))

    await waitFor(() => expect(bodies).toHaveLength(1))
    expect(bodies[0]).toEqual({
      serviceId: whiteningId,
      dentistId,
      patientId,
      branchId,
      startsAt: "2026-08-03T02:00:00.000Z",
      freq: "weekly",
      interval: 1,
      byWeekday: [1, 3],
      count: 6
    })
  })

  it("lists every conflicting occurrence instead of a toast when the series conflicts", async () => {
    server.use(
      ...directoryHandlers(),
      http.post(`${API}/appointments/series`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            errorCode: "SERIES_CONFLICT",
            message: "Some occurrences conflict",
            details: {
              conflicts: [
                { startsAt: "2026-08-10T02:00:00.000Z", reason: "SLOT_CONFLICT" },
                { startsAt: "2026-08-24T02:00:00.000Z", reason: "RESOURCE_UNAVAILABLE" }
              ]
            },
            requestId: "r"
          },
          { status: 409 }
        )
      )
    )
    mount()
    await fillForm()
    await userEvent.click(screen.getByLabelText("Repeat weekly"))
    await userEvent.click(screen.getByRole("button", { name: "Book series" }))

    const list = await screen.findByTestId("series-conflicts")
    expect(list).toHaveTextContent("2 occurrences conflict")
    expect(list).toHaveTextContent("Mon, 10 Aug 2026 09:00 — the dentist is already booked")
    expect(list).toHaveTextContent("Mon, 24 Aug 2026 09:00 — no chair or equipment is free")
    expect(screen.queryByText("Some occurrences conflict")).not.toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("recaps the draft in plain language as the form is filled in, before it is submitted", async () => {
    server.use(...directoryHandlers())
    mount()
    expect(screen.getByTestId("create-summary")).toHaveTextContent("Dr. Anong")
    expect(screen.queryByText("Choose a service with Choose a dentist")).not.toBeInTheDocument()

    await chooseService()
    const summary = screen.getByTestId("create-summary")
    expect(summary).toHaveTextContent("Whitening · Dr. Anong")
    expect(summary).toHaveTextContent("Mon, 3 Aug 2026 · 09:00")

    await userEvent.click(await screen.findByRole("button", { name: /S\. Chaiwat/ }))
    expect(screen.getByTestId("create-summary")).toHaveTextContent("09:00–10:00")
    expect(screen.getByTestId("create-summary").closest("footer")).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText("Repeat weekly"))
    expect(screen.getByTestId("create-summary")).toHaveTextContent("weekly ×4")
  })

  it("passes the typed search through to the patients query", async () => {
    const queries: (string | null)[] = []
    server.use(
      http.get(`${API}/patients`, ({ request }) => {
        queries.push(new URL(request.url).searchParams.get("q"))
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
      ...directoryHandlers()
    )
    mount()
    await waitFor(() => expect(queries).toEqual([null]))

    await userEvent.type(screen.getByLabelText("Patient"), "Chai")
    await waitFor(() => expect(queries).toEqual([null, "Chai"]))
  })

  it("does not treat an uncommitted patient search as a booking change", async () => {
    const onClose = vi.fn()
    server.use(...directoryHandlers())
    mount({ onClose })

    await userEvent.type(await screen.findByLabelText("Patient"), "Kit")
    await userEvent.click(screen.getByRole("button", { name: "Close" }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole("alertdialog", { name: "Discard changes?" })).not.toBeInTheDocument()
  })

  it("shows patient loading, empty and recovery states instead of a blank list", async () => {
    let releasePatients = () => {}
    const patientsArrived = new Promise<void>((resolve) => {
      releasePatients = resolve
    })
    server.use(
      http.get(`${API}/services`, () => HttpResponse.json([])),
      http.get(`${API}/patients`, async () => {
        await patientsArrived
        return HttpResponse.json({ items: [], nextCursor: null })
      })
    )
    mount()

    expect(await screen.findByTestId("patient-results-loading")).toBeInTheDocument()
    releasePatients()
    expect(await screen.findByText("No patients yet")).toBeInTheDocument()
  })

  it("collapses the patient results into a selected patient card", async () => {
    server.use(...directoryHandlers())
    mount()

    await userEvent.click(await screen.findByRole("option", { name: /S\. Chaiwat/ }))
    expect(screen.getByTestId("selected-patient")).toHaveTextContent("S. Chaiwat")
    expect(screen.queryByRole("listbox", { name: "Patient results" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Change patient" })).toBeInTheDocument()
  })

  it("defaults recurrence to the appointment date before dentist and time are chosen", async () => {
    server.use(...directoryHandlers())
    mount({ createDraft: { branchId } })

    await userEvent.click(screen.getByLabelText("Repeat weekly"))
    expect(screen.getByRole("button", { name: "Mon" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("weekday-grid")).toHaveClass("grid-cols-7")
  })

  it("starts at the first missing scheduling field instead of the close action", async () => {
    server.use(...directoryHandlers())
    mount({ createDraft: { branchId } })

    await waitFor(() => expect(screen.getByLabelText("Dentist")).toHaveFocus())
  })

  it("stacks the primary fields on narrow screens and explains what blocks booking", async () => {
    server.use(...directoryHandlers())
    mount()

    expect(screen.getByTestId("create-primary-fields")).toHaveClass("max-[359px]:grid-cols-1")
    const submit = screen.getByRole("button", { name: "Book appointment" })
    expect(submit).toHaveAccessibleDescription("Choose a service and patient to continue.")
    expect(screen.getByTestId("create-missing-fields")).toHaveTextContent("Choose a service and patient")
  })
})
