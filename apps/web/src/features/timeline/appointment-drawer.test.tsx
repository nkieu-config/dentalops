import type { Appointment } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { Toaster, toast } from "sonner"
import { afterEach, describe, expect, it } from "vitest"
import { API, http, HttpResponse, server } from "../../test/msw"
import { AppointmentDrawer } from "./appointment-drawer"

const appointmentId = "4f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const appointment: Appointment = {
  id: appointmentId,
  branchId: "1f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  serviceId: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  dentistId: "2f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  patientId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  startsAt: "2026-08-03T02:00:00.000Z",
  endsAt: "2026-08-03T03:00:00.000Z",
  status: "confirmed",
  version: 1,
  seriesId: null,
  service: { id: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Cleaning", colorIndex: 0 },
  patient: {
    id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    name: "S. Chaiwat",
    phone: "0812345678"
  },
  claims: []
}

const Harness = () => {
  const [selected, setSelected] = useState<Appointment | null>(appointment)
  return <AppointmentDrawer appointment={selected} onClose={() => setSelected(null)} />
}

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <Harness />
      <Toaster />
    </QueryClientProvider>
  )
}

afterEach(() => toast.dismiss())

describe("AppointmentDrawer", () => {
  it("shows the appointment detail and patches the status to completed, then closes", async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch(`${API}/appointments/${appointmentId}/status`, async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ ...appointment, status: "completed", version: 2 })
      })
    )
    mount()
    expect(screen.getByText("09:00–10:00")).toBeInTheDocument()
    expect(screen.getByText("S. Chaiwat · 0812345678")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Complete" }))

    expect(await screen.findByText("Marked completed")).toBeInTheDocument()
    expect(bodies).toEqual([{ status: "completed" }])
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("surfaces the api message on a rejected transition and keeps the drawer open", async () => {
    server.use(
      http.patch(`${API}/appointments/${appointmentId}/status`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            errorCode: "INVALID_TRANSITION",
            message: "Cannot no_show a cancelled appointment",
            requestId: "r"
          },
          { status: 409 }
        )
      )
    )
    mount()

    await userEvent.click(screen.getByRole("button", { name: "No-show" }))

    expect(await screen.findByText("Cannot no_show a cancelled appointment")).toBeInTheDocument()
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("offers no status actions once the appointment has left the confirmed state", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <AppointmentDrawer appointment={{ ...appointment, status: "cancelled" }} onClose={() => {}} />
      </QueryClientProvider>
    )
    expect(screen.getByText("cancelled")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Complete" })).not.toBeInTheDocument()
  })
})
