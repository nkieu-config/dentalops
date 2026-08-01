import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import { API, http, HttpResponse, server } from "../../test/msw"
import { TimelinePage } from "./timeline-page"

const branchId = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const dentistId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"

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
          {
            id: "4f9619ff-8b86-4d01-b42d-00cf4fc964ff",
            branchId,
            serviceId: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff",
            dentistId,
            patientId: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
            startsAt: "2026-08-03T02:00:00.000Z",
            endsAt: "2026-08-03T03:00:00.000Z",
            status: "confirmed",
            version: 1,
            service: {
              id: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff",
              name: "Cleaning",
              colorIndex: 0
            },
            patient: {
              id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff",
              name: "S. Chaiwat",
              phone: "0812345678"
            },
            claims: []
          }
        ])
      )
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/timeline?d=2026-08-03"]}>
          <TimelinePage />
        </MemoryRouter>
      </QueryClientProvider>
    )
    expect(await screen.findByText("Dr. Anong")).toBeInTheDocument()
    expect(await screen.findByText("Cleaning")).toBeInTheDocument()
    expect(screen.getByText("Mon, 3 Aug 2026")).toBeInTheDocument()
    const blocks = screen.getAllByTestId("offshift")
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toHaveStyle({ top: "0px", height: "576px" })
  })
})
