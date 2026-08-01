import type { Appointment } from "@dentalops/contracts"
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useSyncExternalStore } from "react"
import { Toaster, toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API, delay, http, HttpResponse, server } from "../../test/msw"
import { bkkDayStart } from "./lib/geometry"
import { useRescheduleAppointment } from "./use-reschedule"

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const otherDentistId = "8f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const serviceId = "5f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const first = "a1000000-0000-4000-8000-000000000001"
const second = "a1000000-0000-4000-8000-000000000002"

const dayStart = bkkDayStart("2026-08-03")
const queryKey = ["appointments", branchId, dayStart]

const makeAppointment = (
  id: string,
  patientName: string,
  startsAt: string,
  endsAt: string
): Appointment => ({
  id,
  branchId,
  serviceId,
  dentistId,
  patientId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  startsAt,
  endsAt,
  status: "confirmed",
  version: 1,
  seriesId: null,
  service: { id: serviceId, name: "Cleaning", colorIndex: 0 },
  patient: { id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: patientName, phone: "0812345678" },
  claims: []
})

const fixtures = (): Appointment[] => [
  makeAppointment(first, "S. Chaiwat", "2026-08-03T02:00:00.000Z", "2026-08-03T03:00:00.000Z"),
  makeAppointment(second, "N. Pornthip", "2026-08-03T04:00:00.000Z", "2026-08-03T05:00:00.000Z")
]

const useCachedDay = () => {
  const queryClient = useQueryClient()
  return useSyncExternalStore(
    (notify) => queryClient.getQueryCache().subscribe(notify),
    () => queryClient.getQueryData<Appointment[]>(queryKey)
  )
}

const Harness = ({ onConflict }: { onConflict?: (id: string | null) => void }) => {
  const { reschedule, isBusy } = useRescheduleAppointment({ queryKey, onConflict })
  const list = useCachedDay() ?? []
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          reschedule({ id: first, version: 1, startsAt: "2026-08-03T03:00:00.000Z" })
        }
      >
        move first
      </button>
      <button
        type="button"
        onClick={() =>
          reschedule({
            id: first,
            version: 1,
            startsAt: "2026-08-03T03:00:00.000Z",
            dentistId: otherDentistId
          })
        }
      >
        move first across
      </button>
      <button type="button" onClick={() => reschedule({ id: first, version: 1, durationMin: 90 })}>
        resize first
      </button>
      <button
        type="button"
        onClick={() =>
          reschedule({ id: second, version: 1, startsAt: "2026-08-03T06:00:00.000Z" })
        }
      >
        move second
      </button>
      {list.map((a) => (
        <p key={a.id} data-testid={`row-${a.id}`}>
          {`${a.startsAt} ${a.endsAt} v${a.version} ${a.dentistId}`}
        </p>
      ))}
      <p data-testid="busy-first">{isBusy(first) ? "busy" : "idle"}</p>
    </div>
  )
}

const mount = (onConflict?: (id: string | null) => void) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  const seeded = fixtures()
  client.setQueryData(queryKey, seeded)
  render(
    <QueryClientProvider client={client}>
      <Harness onConflict={onConflict} />
      <Toaster />
    </QueryClientProvider>
  )
  return { client, seeded }
}

const conflictBody = (conflictingAppointmentId: string) => ({
  statusCode: 409,
  errorCode: "SLOT_CONFLICT",
  message: "Dentist is already booked at this time",
  details: { constraint: "no_dentist_double_booking", conflictingAppointmentId },
  requestId: "r1"
})

afterEach(() => toast.dismiss())

describe("useRescheduleAppointment", () => {
  it("applies the move to the cache before the server answers and keeps the duration", async () => {
    const patches: unknown[] = []
    server.use(
      http.patch(`${API}/appointments/:id`, async ({ request }) => {
        patches.push(await request.json())
        await delay(60)
        const moved = makeAppointment(
          first,
          "S. Chaiwat",
          "2026-08-03T03:00:00.000Z",
          "2026-08-03T04:00:00.000Z"
        )
        return HttpResponse.json({ ...moved, version: 9 })
      })
    )
    mount()
    await userEvent.click(screen.getByRole("button", { name: "move first" }))

    expect(screen.getByTestId(`row-${first}`)).toHaveTextContent(
      `2026-08-03T03:00:00.000Z 2026-08-03T04:00:00.000Z v2 ${dentistId}`
    )
    expect(screen.getByTestId("busy-first")).toHaveTextContent("busy")
    expect(screen.getByTestId(`row-${second}`)).toHaveTextContent("2026-08-03T04:00:00.000Z")

    await waitFor(() => expect(screen.getByTestId(`row-${first}`)).toHaveTextContent("v9"))
    await waitFor(() => expect(screen.getByTestId("busy-first")).toHaveTextContent("idle"))
    expect(patches).toEqual([{ version: 1, startsAt: "2026-08-03T03:00:00.000Z" }])
  })

  it("derives the optimistic end from durationMin and sends only the duration on a resize", async () => {
    const patches: unknown[] = []
    server.use(
      http.patch(`${API}/appointments/:id`, async ({ request }) => {
        patches.push(await request.json())
        await delay(60)
        return HttpResponse.json(
          makeAppointment(
            first,
            "S. Chaiwat",
            "2026-08-03T02:00:00.000Z",
            "2026-08-03T03:30:00.000Z"
          )
        )
      })
    )
    mount()
    await userEvent.click(screen.getByRole("button", { name: "resize first" }))

    expect(screen.getByTestId(`row-${first}`)).toHaveTextContent(
      "2026-08-03T02:00:00.000Z 2026-08-03T03:30:00.000Z v2"
    )
    await waitFor(() => expect(patches).toEqual([{ version: 1, durationMin: 90 }]))
  })

  it("rolls the cache back and names the appointment it collided with on SLOT_CONFLICT", async () => {
    server.use(
      http.patch(`${API}/appointments/:id`, () =>
        HttpResponse.json(conflictBody(second), { status: 409 })
      )
    )
    const onConflict = vi.fn()
    const { client, seeded } = mount(onConflict)
    await userEvent.click(screen.getByRole("button", { name: "move first across" }))

    expect(await screen.findByText("Conflicts with N. Pornthip at 11:00")).toBeInTheDocument()
    expect(client.getQueryData(queryKey)).toEqual(seeded)
    expect(screen.getByTestId(`row-${first}`)).toHaveTextContent(
      `2026-08-03T02:00:00.000Z 2026-08-03T03:00:00.000Z v1 ${dentistId}`
    )
    expect(onConflict).toHaveBeenCalledWith(second)
  })

  it("falls back to the api message when the conflicting appointment is not in the cached day", async () => {
    server.use(
      http.patch(`${API}/appointments/:id`, () =>
        HttpResponse.json(conflictBody("a1000000-0000-4000-8000-000000000009"), { status: 409 })
      )
    )
    const onConflict = vi.fn()
    mount(onConflict)
    await userEvent.click(screen.getByRole("button", { name: "move first" }))

    expect(await screen.findByText("Dentist is already booked at this time")).toBeInTheDocument()
    expect(onConflict).toHaveBeenCalledWith("a1000000-0000-4000-8000-000000000009")
  })

  it("rolls back and says someone else changed it on STALE_VERSION", async () => {
    server.use(
      http.patch(`${API}/appointments/:id`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            errorCode: "STALE_VERSION",
            message: "Appointment was changed by someone else",
            details: { currentVersion: 4 },
            requestId: "r2"
          },
          { status: 409 }
        )
      )
    )
    const { client, seeded } = mount()
    await userEvent.click(screen.getByRole("button", { name: "move first" }))

    expect(
      await screen.findByText("This appointment was changed by someone else — refreshed")
    ).toBeInTheDocument()
    expect(client.getQueryData(queryKey)).toEqual(seeded)
    await waitFor(() =>
      expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true)
    )
  })

  it("serializes per appointment: one patch per busy id, but two ids move in parallel", async () => {
    const patched: string[] = []
    let release = () => {}
    const inFlight = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch(`${API}/appointments/:id`, async ({ params }) => {
        patched.push(String(params.id))
        await inFlight
        return HttpResponse.json(
          makeAppointment(
            String(params.id),
            "S. Chaiwat",
            "2026-08-03T03:00:00.000Z",
            "2026-08-03T04:00:00.000Z"
          )
        )
      })
    )
    mount()
    const moveFirst = screen.getByRole("button", { name: "move first" })
    await userEvent.click(moveFirst)
    await userEvent.click(moveFirst)
    await userEvent.click(screen.getByRole("button", { name: "move second" }))

    await waitFor(() => expect(screen.getByTestId("busy-first")).toHaveTextContent("busy"))
    expect(patched).toEqual([first, second])

    release()
    await waitFor(() => expect(screen.getByTestId("busy-first")).toHaveTextContent("idle"))
    expect(patched).toEqual([first, second])
  })
})
