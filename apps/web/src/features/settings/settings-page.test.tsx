import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
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

const defaultStaff = [{ id: ids.owner, name: "Owner", role: "owner", isActive: true }]

const handlers = (staff: Array<{ id: string; name: string; role: string; isActive: boolean }> = defaultStaff) => [
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
  http.get(`${API}/staff`, () => HttpResponse.json(staff))
]

afterEach(() => {
  vi.restoreAllMocks()
  setSession(null)
})

describe("SettingsPage", () => {
  it("lets both identity fields be emptied instead of snapping the old values back", async () => {
    owner()
    server.use(...handlers())
    const { user } = mount()

    await user.clear(await screen.findByLabelText("Clinic name"))
    await user.clear(screen.getByLabelText("Booking URL"))

    expect(screen.getByLabelText("Clinic name")).toHaveValue("")
    expect(screen.getByLabelText("Booking URL")).toHaveValue("")
  })

  it("shows the shape of each section while it loads, and says it is busy", async () => {
    owner()
    server.use(...handlers())
    mount()

    const loading = screen.getByLabelText("Loading branches")
    expect(loading).toHaveAttribute("aria-busy", "true")
    expect(within(loading).getAllByTestId("section-row-skeleton").length).toBeGreaterThan(0)
    await screen.findByLabelText("Clinic name")
  })

  it("explains owner access instead of making forbidden requests", () => {
    receptionist()
    mount()

    expect(screen.getByRole("heading", { name: "Settings" })).toBeVisible()
    expect(screen.getByText("Only an owner can change clinic settings.")).toBeVisible()
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).not.toBeInTheDocument()
  })

  it("centres the owner settings workspace without a section navigation rail", async () => {
    owner()
    server.use(...handlers())
    mount()

    await waitFor(() => expect(screen.getByRole("heading", { name: "Clinic profile" })).toBeVisible())
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toHaveClass("type-page-title")
    expect(screen.getByRole("heading", { name: "Branches" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Services" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Resources" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Staff" })).toBeVisible()
    expect(screen.getByText("The name and URL patients see when they book.")).toBeVisible()
    expect(screen.getByText("Opening hours control when each location can accept bookings.")).toBeVisible()
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).not.toBeInTheDocument()
  })

  it("reserves the patient preview for extra-wide clinic profile layouts", async () => {
    owner()
    server.use(...handlers())
    mount()

    const previewLabel = await screen.findByText("Patient preview", { exact: true })

    expect(previewLabel.parentElement).toHaveClass("hidden", "xl:block")
  })

  it("keeps section anchors for direct Settings links", async () => {
    owner()
    server.use(...handlers())
    mount()

    const branchesHeading = await screen.findByRole("heading", { name: "Branches" })

    expect(branchesHeading.closest("section")).toHaveAttribute("id", "branches")
  })

  it("keeps the service save action in the sheet footer", async () => {
    owner()
    server.use(...handlers())
    const { user } = mount()

    await user.click(await screen.findByRole("button", { name: "Add service" }))

    expect(screen.getByRole("button", { name: "Save service" }).closest("footer")).toBeInTheDocument()
  })

  it("uses one keyboard tab stop for the selected service colour", async () => {
    owner()
    server.use(...handlers())
    const { user } = mount()

    await user.click(await screen.findByRole("button", { name: "Add service" }))

    expect(screen.getByRole("radio", { name: "Select Teal timeline colour" })).toHaveAttribute("tabindex", "0")
    expect(screen.getByRole("radio", { name: "Select Blue timeline colour" })).toHaveAttribute("tabindex", "-1")
  })

  it("keeps concise section context alongside field guidance and omits active badges", async () => {
    owner()
    server.use(...handlers())
    mount()

    await screen.findByLabelText("Booking URL")

    expect(screen.queryByText("Keep clinic details, scheduling capacity and team access current.")).not.toBeInTheDocument()
    expect(screen.getByText("The name and URL patients see when they book.")).toBeVisible()
    expect(screen.getByText("Lowercase letters, numbers and hyphens.")).toBeVisible()
    expect(screen.queryByText("Active", { exact: true })).not.toBeInTheDocument()
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

  it("keeps public link actions unavailable while the booking slug is unsaved", async () => {
    owner()
    server.use(...handlers())
    const { user } = mount()

    await user.clear(await screen.findByLabelText("Booking URL"))
    await user.type(screen.getByLabelText("Booking URL"), "new-booking-url")

    expect(screen.getByText("Save changes to publish this link.")).toBeVisible()
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled()
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("aria-disabled", "true")
  })

  it("retries a failed clinic profile request from its error state", async () => {
    owner()
    let unavailable = true
    server.use(
      http.get(`${API}/tenant`, () => {
        if (unavailable) {
          unavailable = false
          return new HttpResponse(null, { status: 500 })
        }
        return HttpResponse.json({
          id: ids.tenant,
          name: "Bright Smile",
          slug: "bright-smile",
          publicBookingPath: "/book/bright-smile"
        })
      }),
      ...handlers()
    )
    const { user } = mount()

    await user.click(await screen.findByRole("button", { name: "Retry" }))

    expect(await screen.findByLabelText("Clinic name")).toHaveValue("Bright Smile")
  })

  it("only confirms a copied booking link after the clipboard accepts it", async () => {
    owner()
    server.use(...handlers())
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Clipboard unavailable"))
    const { user } = mount()

    await screen.findByDisplayValue("bright-smile")
    await user.click(await screen.findByRole("button", { name: "Copy" }))

    expect(await screen.findByText("Could not copy link. Select and copy it manually.")).toBeVisible()
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
    await user.click(await screen.findByRole("button", { name: "Edit Owner" }))
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
    await user.click(screen.getByRole("button", { name: "Edit Monday hours" }))
    await user.type(screen.getByLabelText("Branch name"), "Rama 9")
    await user.clear(screen.getByLabelText("Monday opening 1 ends"))
    await user.type(screen.getByLabelText("Monday opening 1 ends"), "08:00")
    await user.click(screen.getByRole("button", { name: "Save branch" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("An opening interval must end after it starts")
  })

  it("expands one opening-hours day at a time", async () => {
    owner()
    server.use(...handlers())
    const { user } = mount()

    await user.click(await screen.findByRole("button", { name: "Add branch" }))

    expect(screen.queryByLabelText("Monday opening 1 starts")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Edit Monday hours" }))
    expect(screen.getByLabelText("Monday opening 1 starts")).toBeVisible()
    expect(screen.queryByLabelText("Tuesday opening 1 starts")).not.toBeInTheDocument()
  })

  it("confirms before applying one day’s hours to all weekdays", async () => {
    owner()
    server.use(...handlers())
    const { user } = mount()

    await user.click(await screen.findByRole("button", { name: "Add branch" }))
    await user.click(screen.getByRole("button", { name: "Edit Monday hours" }))
    await user.click(screen.getByRole("button", { name: "Apply Monday hours to weekdays" }))

    expect(await screen.findByRole("alertdialog", { name: "Apply Monday hours to weekdays?" })).toBeVisible()
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

  it("paints every colour swatch with its own timeline hue", async () => {
    owner()
    server.use(...handlers())
    const { user } = mount()

    await user.click(await screen.findByRole("button", { name: "Add service" }))
    const group = screen.getByRole("radiogroup", { name: "Service color" })
    const swatches = within(group).getAllByRole("radio")

    const painted = swatches.map((swatch, index) => {
      expect(swatch.style.backgroundColor).toBe(`var(--hue${index}-bg)`)
      return swatch.style.backgroundColor
    })
    expect(new Set(painted).size).toBe(swatches.length)
  })

  it("marks the selected service color swatch as checked and updates on click", async () => {
    owner()
    server.use(...handlers())
    const { user } = mount()

    await user.click(await screen.findByRole("button", { name: "Add service" }))
    const group = screen.getByRole("radiogroup", { name: "Service color" })
    const [first, second] = within(group).getAllByRole("radio")

    expect(first).toHaveAttribute("aria-checked", "true")
    expect(second).toHaveAttribute("aria-checked", "false")

    await user.click(second!)

    expect(first).toHaveAttribute("aria-checked", "false")
    expect(second).toHaveAttribute("aria-checked", "true")
  })

  it("changes service colour with arrow keys", async () => {
    owner()
    server.use(...handlers())
    const { user } = mount()

    await user.click(await screen.findByRole("button", { name: "Add service" }))
    const group = screen.getByRole("radiogroup", { name: "Service color" })
    const [first, second] = within(group).getAllByRole("radio")

    first!.focus()
    await user.keyboard("{ArrowRight}")

    expect(second).toHaveAttribute("aria-checked", "true")
  })

  it("names branch row actions after the branch they change", async () => {
    owner()
    server.use(...handlers())
    mount()

    const branchesHeading = await screen.findByRole("heading", { name: "Branches" })
    const branchesSection = branchesHeading.closest("section")!

    expect(await within(branchesSection).findByRole("button", { name: "Edit Main" })).toBeVisible()
    expect(within(branchesSection).getByRole("button", { name: "Deactivate Main" })).toBeVisible()
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
    await user.click(screen.getByLabelText("Type"))
    await user.click(await screen.findByRole("option", { name: "Equipment" }))
    await user.click(screen.getByLabelText("Equipment type"))
    await user.click(await screen.findByRole("option", { name: "X-ray" }))
    await user.click(screen.getByRole("button", { name: "Save resource" }))

    await waitFor(() => expect(body).toEqual({ name: "New X-ray", branchId: ids.branch, type: "equipment", equipmentTypeId: ids.equipmentType }))
  })

  it("guides resource setup to branches when no branch exists", async () => {
    owner()
    server.use(
      http.get(`${API}/branches`, () => HttpResponse.json([])),
      http.get(`${API}/resources`, () => HttpResponse.json([])),
      ...handlers()
    )
    mount()

    const resourcesHeading = await screen.findByRole("heading", { name: "Resources" })
    const resourcesSection = resourcesHeading.closest("section")!
    expect(await within(resourcesSection).findByRole("button", { name: "Add branch" })).toBeVisible()
    expect(within(resourcesSection).queryByRole("button", { name: "Add resource" })).not.toBeInTheDocument()
  })

  it("keeps inactive branches and services readable with a clear state badge", async () => {
    owner()
    server.use(
      http.get(`${API}/branches`, () =>
        HttpResponse.json([
          { id: ids.branch, name: "Main", timezone: "Asia/Bangkok", openingHours, isActive: false }
        ])
      ),
      http.get(`${API}/services`, () =>
        HttpResponse.json([
          { id: ids.service, name: "Cleaning", durationMin: 45, bufferMin: 0, colorIndex: 0, isActive: false }
        ])
      ),
      ...handlers()
    )
    mount()

    const branchesHeading = await screen.findByRole("heading", { name: "Branches" })
    const branchesSection = branchesHeading.closest("section")!
    const branchName = await within(branchesSection).findByText("Main")
    expect(branchName.closest(".opacity-75")).toBeNull()
    expect(within(branchesSection).getByText("Inactive", { exact: true })).toBeVisible()

    const servicesHeading = await screen.findByRole("heading", { name: "Services" })
    const servicesSection = servicesHeading.closest("section")!
    const serviceName = await within(servicesSection).findByText("Cleaning")
    expect(serviceName.closest(".opacity-75")).toBeNull()
    expect(within(servicesSection).getByText("Inactive", { exact: true })).toBeVisible()
  })

  it("blocks deactivating the last remaining owner and explains why", async () => {
    owner()
    server.use(...handlers())
    mount()

    const staffHeading = await screen.findByRole("heading", { name: "Staff" })
    const staffSection = staffHeading.closest("section")!
    await within(staffSection).findByText("Owner")

    expect(within(staffSection).queryByRole("button", { name: "Deactivate Owner" })).not.toBeInTheDocument()
    expect(within(staffSection).getByText("The last owner can't be deactivated.")).toBeVisible()
  })

  it("allows deactivating an owner when another owner remains", async () => {
    owner()
    const secondOwnerId = "99999999-9999-4999-8999-999999999999"
    server.use(
      ...handlers([
        { id: ids.owner, name: "Owner", role: "owner", isActive: true },
        { id: secondOwnerId, name: "Co-Owner", role: "owner", isActive: true }
      ]),
      http.patch(`${API}/staff/${secondOwnerId}`, () =>
        HttpResponse.json({ id: secondOwnerId, name: "Co-Owner", role: "owner", isActive: false })
      )
    )
    const { user } = mount()

    const staffHeading = await screen.findByRole("heading", { name: "Staff" })
    const staffSection = staffHeading.closest("section")!
    await within(staffSection).findByText("Co-Owner")

    expect(within(staffSection).queryByText("The last owner can't be deactivated.")).not.toBeInTheDocument()

    await user.click(within(staffSection).getByRole("button", { name: "Deactivate Co-Owner" }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }))

    await waitFor(() => expect(within(staffSection).getByRole("heading", { name: "Inactive team" })).toBeVisible())
  })
})
