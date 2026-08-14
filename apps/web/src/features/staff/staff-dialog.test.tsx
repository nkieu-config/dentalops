import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Toaster, toast } from "sonner"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API, delay, http, HttpResponse, server } from "../../test/msw"
import { goOffline } from "../../test/network"
import { StaffDialog } from "./staff-dialog"

const created = {
  id: "3f9619ff-8b86-4d01-b42d-00cf4fc964ff",
  name: "Dr. Anong",
  role: "dentist",
  isActive: true
}

const recorded: { posts: Record<string, unknown>[] } = { posts: [] }

const apiError = (status: number, errorCode: string, message: string) =>
  HttpResponse.json({ statusCode: status, errorCode, message, requestId: "r" }, { status })

interface HandlerOptions {
  response?: () => Response
  delayMs?: number
}

const handlers = (options: HandlerOptions = {}) => [
  http.post(`${API}/staff`, async ({ request }) => {
    recorded.posts.push((await request.json()) as Record<string, unknown>)
    if (options.delayMs) await delay(options.delayMs)
    return options.response?.() ?? HttpResponse.json(created)
  })
]

const mount = (onClose = vi.fn()) => {
  const user = userEvent.setup()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <StaffDialog onClose={onClose} />
      <Toaster />
    </QueryClientProvider>
  )
  return { user, onClose }
}

type User = ReturnType<typeof userEvent.setup>

const fill = async (user: User, overrides: Partial<Record<string, string>> = {}) => {
  const values = {
    Name: "Dr. Anong",
    Email: "anong@brightsmile.test",
    Password: "correct-horse",
    ...overrides
  }
  for (const [label, value] of Object.entries(values)) {
    if (!value) continue
    await user.type(screen.getByLabelText(label), value)
  }
}

describe("StaffDialog", () => {
  beforeEach(() => {
    recorded.posts = []
  })

  afterEach(() => {
    toast.dismiss()
  })

  it("labels every field and declares the types password managers need", () => {
    mount()

    expect(screen.getByLabelText("Name")).toHaveAttribute("name", "name")

    const email = screen.getByLabelText("Email")
    expect(email).toHaveAttribute("name", "email")
    expect(email).toHaveAttribute("type", "email")
    expect(email).toHaveAttribute("autocomplete", "email")

    const password = screen.getByLabelText("Password")
    expect(password).toHaveAttribute("name", "password")
    expect(password).toHaveAttribute("type", "password")
    expect(password).toHaveAttribute("autocomplete", "new-password")

    expect(screen.getByLabelText("Role")).toHaveAttribute("name", "role")
    expect(screen.getByLabelText("Role")).toHaveClass("sm:h-10")
  })

  it("offers only the roles the API will accept", async () => {
    const { user } = mount()

    const role = screen.getByLabelText("Role")
    await user.click(role)
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual(["Dentist — takes appointments", "Receptionist — books and manages the desk"])
  })

  it("shows a short password under its own field and sends nothing", async () => {
    server.use(...handlers())
    const { user } = mount()
    await fill(user, { Password: "short12" })

    await user.click(screen.getByRole("button", { name: "Add colleague" }))

    const password = screen.getByLabelText("Password")
    expect(password).toHaveAttribute("aria-invalid", "true")
    expect(password).toHaveAccessibleDescription(/At least 8 characters/)
    expect(recorded.posts).toHaveLength(0)
    expect(password).toHaveFocus()
  })

  it("sends exactly what CreateStaffDto asks for and closes", async () => {
    server.use(...handlers())
    const { user, onClose } = mount()
    await fill(user)

    await user.click(screen.getByRole("button", { name: "Add colleague" }))

    await waitFor(() => expect(recorded.posts).toHaveLength(1))
    expect(recorded.posts[0]).toEqual({
      name: "Dr. Anong",
      email: "anong@brightsmile.test",
      password: "correct-horse",
      role: "dentist"
    })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("puts a 409 EMAIL_TAKEN under the email field and focuses it", async () => {
    server.use(
      ...handlers({
        response: () =>
          apiError(409, "EMAIL_TAKEN", "Somebody in this clinic already uses that email")
      })
    )
    const { user, onClose } = mount()
    await fill(user)

    await user.click(screen.getByRole("button", { name: "Add colleague" }))

    const email = screen.getByLabelText("Email")
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"))
    expect(email).toHaveAccessibleDescription(/already uses that email/)
    expect(email).toHaveFocus()
    expect(screen.getByRole("alert")).toHaveTextContent("Somebody in this clinic already uses that email")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("announces an unmapped server failure once, at form level", async () => {
    server.use(...handlers({ response: () => apiError(500, "INTERNAL", "Something exploded") }))
    const { user } = mount()
    await fill(user)

    await user.click(screen.getByRole("button", { name: "Add colleague" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Something exploded")
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "false")
  })

  it("says what it is doing and disables the button while the request is in flight", async () => {
    server.use(...handlers({ delayMs: 40 }))
    const { user } = mount()
    await fill(user)

    await user.click(screen.getByRole("button", { name: "Add colleague" }))

    const pending = await screen.findByRole("button", { name: "Adding…" })
    expect(pending).toBeDisabled()
  })

  it("warns before discarding a partly filled invite instead of losing it silently", async () => {
    const { user, onClose } = mount()
    await user.type(screen.getByLabelText("Name"), "Dr. Anong")
    await user.type(screen.getByLabelText("Password"), "correct-horse")

    await user.click(screen.getByRole("button", { name: "Close" }))

    expect(await screen.findByText("Discard changes?")).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: "Discard" }))
    expect(onClose).toHaveBeenCalled()
  })

  it("warns before the browser unloads a partly filled invite", async () => {
    const { user } = mount()
    await user.type(screen.getByLabelText("Name"), "Dr. Anong")
    const event = new Event("beforeunload", { cancelable: true })

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it("closes without a prompt when nothing has been typed yet", async () => {
    const { user, onClose } = mount()

    await user.click(screen.getByRole("button", { name: "Close" }))

    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it("refuses to submit while the browser is offline", async () => {
    server.use(...handlers())
    const { user } = mount()
    await fill(user)
    goOffline()

    const submit = screen.getByRole("button", { name: "Add colleague" })
    expect(submit).toBeDisabled()
    expect(submit).toHaveAccessibleDescription(/offline/)

    await user.click(submit)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(recorded.posts).toHaveLength(0)
  })
})
