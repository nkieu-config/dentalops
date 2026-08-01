import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Toaster, toast } from "sonner"
import { afterEach, describe, expect, it } from "vitest"
import { API, http, HttpResponse, server } from "../../test/msw"
import { CreateDrawer, type CreateDraft } from "./create-drawer"
import { bkkDayStart } from "./lib/geometry"

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const cleaningId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const whiteningId = "5f9619ff-8b86-4d01-b42d-00cf4fc964fe"
const patientId = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const draft: CreateDraft = {
  dentist: { id: dentistId, name: "Dr. Anong", role: "dentist", isActive: true },
  branchId,
  startsAt: bkkDayStart("2026-08-03") + 9 * 3_600_000
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
        { id: patientId, name: "S. Chaiwat", phone: "0812345678" },
        { id: "6f9619ff-8b86-4d01-b42d-00cf4fc964fe", name: "N. Pornthip", phone: "0898765432" }
      ],
      nextCursor: null
    })
  )
]

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CreateDrawer draft={draft} onClose={() => {}} />
      <Toaster />
    </QueryClientProvider>
  )
}

const fillForm = async () => {
  await screen.findByRole("option", { name: /Whitening/ })
  await userEvent.selectOptions(screen.getByLabelText("Service"), whiteningId)
  await userEvent.click(await screen.findByRole("button", { name: /S\. Chaiwat/ }))
}

afterEach(() => toast.dismiss())

describe("CreateDrawer", () => {
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
    expect(screen.getByText("Dr. Anong")).toBeInTheDocument()
    expect(screen.getByText("09:00")).toBeInTheDocument()

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

    expect(await screen.findByText("Dentist is already booked at this time")).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByLabelText("Service")).toHaveValue(whiteningId)
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
    await screen.findByRole("option", { name: /Whitening/ })
    expect(screen.getByRole("button", { name: "Book appointment" })).toBeDisabled()

    await userEvent.selectOptions(screen.getByLabelText("Service"), whiteningId)
    expect(screen.getByRole("button", { name: "Book appointment" })).toBeDisabled()

    await userEvent.click(screen.getByRole("button", { name: /S\. Chaiwat/ }))
    expect(screen.getByRole("button", { name: "Book appointment" })).toBeEnabled()
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
    await waitFor(() => expect(queries.at(-1)).toBe("Chai"))
  })
})
