import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { API, http, HttpResponse, server } from "../../test/msw"
import { setSession } from "../../lib/session"
import { SettingsPage } from "./settings-page"

const ids = {
  tenant: "11111111-1111-4111-8111-111111111111",
  owner: "22222222-2222-4222-8222-222222222222",
  branch: "33333333-3333-4333-8333-333333333333",
  service: "44444444-4444-4444-8444-444444444444",
  resource: "55555555-5555-4555-8555-555555555555",
  equipmentType: "66666666-6666-4666-8666-666666666666"
}

const openingHours = {
  mon: [["09:00", "18:00"]],
  tue: [["09:00", "18:00"]],
  wed: [["09:00", "18:00"]],
  thu: [["09:00", "18:00"]],
  fri: [["09:00", "18:00"]],
  sat: [],
  sun: []
}

const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={client}>
      <SettingsPage />
    </QueryClientProvider>
  )
  return { user }
}

const owner = () =>
  setSession({
    accessToken: "owner-token",
    user: { id: ids.owner, tenantId: ids.tenant, name: "Owner", role: "owner" }
  })

const receptionist = () =>
  setSession({
    accessToken: "reception-token",
    user: { id: ids.owner, tenantId: ids.tenant, name: "Reception", role: "receptionist" }
  })

const handlers = () => [
  http.get(`${API}/tenant`, () =>
    HttpResponse.json({
      id: ids.tenant,
      name: "Bright Smile",
      slug: "bright-smile",
      publicBookingPath: "/book/bright-smile"
    })
  ),
  http.get(`${API}/branches`, () =>
    HttpResponse.json([
      { id: ids.branch, name: "Main", timezone: "Asia/Bangkok", openingHours, isActive: true }
    ])
  ),
  http.get(`${API}/services`, () =>
    HttpResponse.json([
      { id: ids.service, name: "Cleaning", durationMin: 45, bufferMin: 0, colorIndex: 0, isActive: true }
    ])
  ),
  http.get(`${API}/resources`, () =>
    HttpResponse.json([
      {
        id: ids.resource,
        name: "Chair 1",
        type: "chair",
        branchId: ids.branch,
        equipmentTypeId: null,
        isActive: true
      }
    ])
  ),
  http.get(`${API}/equipment-types`, () => HttpResponse.json([{ id: ids.equipmentType, name: "X-ray" }])),
  http.get(`${API}/staff`, () =>
    HttpResponse.json([{ id: ids.owner, name: "Owner", role: "owner", isActive: true }])
  )
]

afterEach(() => setSession(null))

describe("SettingsPage", () => {
  it("explains owner access instead of making forbidden requests", () => {
    receptionist()
    mount()

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible()
    expect(screen.getByText("Only an owner can change clinic settings.")).toBeVisible()
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).not.toBeInTheDocument()
  })

  it("loads each settings section for an owner", async () => {
    owner()
    server.use(...handlers())
    mount()

    await waitFor(() => expect(screen.getByRole("heading", { name: "Clinic profile" })).toBeVisible())
    expect(screen.getByRole("heading", { name: "Branches" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Services" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Resources" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Staff" })).toBeVisible()
    expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeVisible()
  })

  it("saves a clinic profile and shows the changed public booking path", async () => {
    owner()
    let patch: Record<string, unknown> | null = null
    server.use(
      ...handlers(),
      http.patch(`${API}/tenant`, async ({ request }) => {
        patch = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          id: ids.tenant,
          name: "Bright Smile Clinic",
          slug: "bright-smile-clinic",
          publicBookingPath: "/book/bright-smile-clinic"
        })
      })
    )
    const { user } = mount()

    await user.clear(await screen.findByLabelText("Clinic name"))
    await user.type(screen.getByLabelText("Clinic name"), "Bright Smile Clinic")
    await user.clear(screen.getByLabelText("Booking URL"))
    await user.type(screen.getByLabelText("Booking URL"), "bright-smile-clinic")
    await user.click(screen.getByRole("button", { name: "Save clinic" }))

    await waitFor(() => expect(patch).toEqual({ name: "Bright Smile Clinic", slug: "bright-smile-clinic" }))
    expect(await screen.findByText(/\/book\/bright-smile-clinic/)).toBeVisible()
  })

  it("lets an owner rename themselves without submitting a forbidden role change", async () => {
    owner()
    let patch: Record<string, unknown> | null = null
    server.use(
      ...handlers(),
      http.patch(`${API}/staff/${ids.owner}`, async ({ request }) => {
        patch = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: ids.owner, name: "Clinic Owner", role: "owner", isActive: true })
      })
    )
    const { user } = mount()

    await screen.findByText("Owner")
    await user.click((await screen.findAllByRole("button", { name: "Edit" })).at(-1)!)
    await user.clear(await screen.findByLabelText("Name"))
    await user.type(screen.getByLabelText("Name"), "Clinic Owner")
    await user.click(screen.getByRole("button", { name: "Save staff member" }))

    await waitFor(() => expect(patch).toEqual({ name: "Clinic Owner" }))
  })

  it("rejects invalid opening hours in the branch sheet before sending them", async () => {
    owner()
    server.use(...handlers())
    const { user } = mount()

    await user.click(await screen.findByRole("button", { name: "Add branch" }))
    await user.type(screen.getByLabelText("Branch name"), "Rama 9")
    await user.clear(screen.getByLabelText("Monday opening 1 ends"))
    await user.type(screen.getByLabelText("Monday opening 1 ends"), "08:00")
    await user.click(screen.getByRole("button", { name: "Save branch" }))

    expect(await screen.findByText("An opening interval must end after it starts")).toBeVisible()
  })

  it("creates a service from its settings sheet", async () => {
    owner()
    let body: Record<string, unknown> | null = null
    server.use(
      ...handlers(),
      http.post(`${API}/services`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: "77777777-7777-4777-8777-777777777777", name: "Whitening", durationMin: 30, bufferMin: 0, colorIndex: 0, isActive: true })
      })
    )
    const { user } = mount()

    await user.click(await screen.findByRole("button", { name: "Add service" }))
    await user.type(screen.getByLabelText("Service name"), "Whitening")
    await user.click(screen.getByRole("button", { name: "Save service" }))

    await waitFor(() => expect(body).toEqual({ name: "Whitening", durationMin: 30, bufferMin: 0, colorIndex: 0 }))
  })

  it("creates an equipment resource from its settings sheet", async () => {
    owner()
    let body: Record<string, unknown> | null = null
    server.use(
      ...handlers(),
      http.post(`${API}/resources`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ id: "88888888-8888-4888-8888-888888888888", name: "New X-ray", type: "equipment", branchId: ids.branch, equipmentTypeId: ids.equipmentType, isActive: true })
      })
    )
    const { user } = mount()

    await user.click(await screen.findByRole("button", { name: "Add resource" }))
    await user.type(screen.getByLabelText("Resource name"), "New X-ray")
    await user.selectOptions(screen.getByLabelText("Type"), "equipment")
    await user.selectOptions(screen.getByLabelText("Equipment type"), ids.equipmentType)
    await user.click(screen.getByRole("button", { name: "Save resource" }))

    await waitFor(() => expect(body).toEqual({ name: "New X-ray", branchId: ids.branch, type: "equipment", equipmentTypeId: ids.equipmentType }))
  })
})
