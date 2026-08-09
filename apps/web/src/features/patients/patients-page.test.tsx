import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router"
import { beforeEach, describe, expect, it } from "vitest"
import { setSession } from "../../lib/session"
import { API, http, HttpResponse, server } from "../../test/msw"
import { PatientsPage } from "./patients-page"

const tenantId = "9f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const first = "1f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const second = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const third = "3f9619ff-8b86-4d01-b42d-00cf4fc964ff"

const requests: { q: string | null; cursor: string | null }[] = []

const patient = (id: string, name: string, phone: string) => ({ id, name, phone })

const ShowLocation = () => {
  const location = useLocation()
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>
}

const mount = (entry = "/app/patients") => {
  setSession({
    accessToken: "t1",
    user: { id: "u1", tenantId, name: "Malee Owner", role: "owner" }
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <ShowLocation />
        <PatientsPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
  return userEvent.setup()
}

const listing = (
  pages: Record<string, { items: ReturnType<typeof patient>[]; nextCursor: string | null }>
) =>
  http.get(`${API}/patients`, ({ request }) => {
    const url = new URL(request.url)
    const q = url.searchParams.get("q")
    const cursor = url.searchParams.get("cursor")
    requests.push({ q, cursor })
    return HttpResponse.json(pages[`${q ?? ""}|${cursor ?? ""}`] ?? { items: [], nextCursor: null })
  })

describe("PatientsPage", () => {
  beforeEach(() => {
    requests.length = 0
  })

  it("lists patients and links each row to its detail screen", async () => {
    server.use(
      listing({
        "|": {
          items: [
            patient(first, "Kanya Wongchai", "0812345678"),
            patient(second, "Somchai Detchat", "0823456789")
          ],
          nextCursor: null
        }
      })
    )
    mount()

    const rows = await screen.findAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByRole("link", { name: /Kanya Wongchai/ })).toHaveAttribute(
      "href",
      `/app/patients/${first}`
    )
    expect(rows[0]).toHaveTextContent("0812345678")
    expect(within(rows[1]!).getByRole("link", { name: /Somchai Detchat/ })).toHaveAttribute(
      "href",
      `/app/patients/${second}`
    )
  })

  it("labels the search box visibly rather than leaning on a placeholder", async () => {
    server.use(listing({ "|": { items: [patient(first, "Kanya", "081")], nextCursor: null } }))
    mount()

    const box = await screen.findByLabelText("Search patients")
    expect(box.tagName).toBe("INPUT")
    expect(box).toHaveAttribute("type", "search")
  })

  it("debounces the search, puts it in the url and asks the api for it", async () => {
    server.use(
      listing({
        "|": { items: [patient(first, "Kanya Wongchai", "0812345678")], nextCursor: null },
        "kanya|": { items: [patient(first, "Kanya Wongchai", "0812345678")], nextCursor: null }
      })
    )
    const user = mount()

    await screen.findAllByRole("listitem")
    expect(requests).toEqual([{ q: null, cursor: null }])

    await user.type(await screen.findByLabelText("Search patients"), "kanya")

    expect(requests).toHaveLength(1)

    await waitFor(() => expect(screen.getByTestId("url")).toHaveTextContent("/app/patients?q=kanya"))
    await waitFor(() => expect(requests).toContainEqual({ q: "kanya", cursor: null }))
    expect(requests.filter((r) => r.q === "kanya")).toHaveLength(1)
  })

  it("starts from a search already in the url", async () => {
    server.use(
      listing({ "kanya|": { items: [patient(first, "Kanya Wongchai", "081")], nextCursor: null } })
    )
    mount("/app/patients?q=kanya")

    expect(await screen.findByLabelText("Search patients")).toHaveValue("kanya")
    await waitFor(() => expect(requests).toEqual([{ q: "kanya", cursor: null }]))

    expect(await screen.findByRole("link", { name: /Kanya Wongchai/ })).toHaveAttribute(
      "href",
      `/app/patients/${first}?q=kanya`
    )
  })

  it("pages with a Load more button rather than on scroll", async () => {
    server.use(
      listing({
        "|": { items: [patient(first, "Kanya Wongchai", "081")], nextCursor: "cur-2" },
        "|cur-2": { items: [patient(second, "Somchai Detchat", "082")], nextCursor: null }
      })
    )
    const user = mount()

    const more = await screen.findByRole("button", { name: "Load more" })
    expect(await screen.findAllByRole("listitem")).toHaveLength(1)

    await user.click(more)

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2))
    expect(requests).toEqual([
      { q: null, cursor: null },
      { q: null, cursor: "cur-2" }
    ])
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument()
    )
  })

  it("says a search found nobody and offers to clear it", async () => {
    server.use(
      listing({
        "|": { items: [patient(third, "Anong Prasert", "083")], nextCursor: null },
        "zzz|": { items: [], nextCursor: null }
      })
    )
    const user = mount("/app/patients?q=zzz")

    expect(await screen.findByText("No patient matches “zzz”")).toBeInTheDocument()
    expect(screen.queryByRole("list", { name: "Patients" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Clear the search" }))

    expect(await screen.findByText("Anong Prasert")).toBeInTheDocument()
    expect(screen.getByTestId("url")).toHaveTextContent("/app/patients")
    expect(screen.getByTestId("url")).not.toHaveTextContent("q=zzz")
  })

  it("explains an empty clinic instead of drawing an empty list", async () => {
    server.use(listing({ "|": { items: [], nextCursor: null } }))
    mount()

    expect(await screen.findByText("No patients yet")).toBeInTheDocument()
    expect(
      screen.getByText("Patients appear here as soon as somebody books, online or at the desk.")
    ).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Clear the search" })).not.toBeInTheDocument()
  })

  it("says so when the list cannot be loaded, and a retry actually recovers it", async () => {
    server.use(http.get(`${API}/patients`, () => HttpResponse.error()))
    const user = mount()

    expect(await screen.findByText("Could not load the patients")).toBeInTheDocument()

    server.use(listing({ "|": { items: [patient(first, "Malee Suk", "0812345678")], nextCursor: null } }))
    await user.click(screen.getByRole("button", { name: "Retry" }))

    expect(await screen.findByText("Malee Suk")).toBeInTheDocument()
    expect(screen.queryByText("Could not load the patients")).not.toBeInTheDocument()
  })
})
