import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getSession, isDemo } from "../../lib/session"
import { API, delay, http, HttpResponse, server } from "../../test/msw"
import { LAST_CLINIC_KEY, SignupPage } from "./signup-page"

const session = {
  accessToken: "header.payload.signature",
  user: {
    id: "9f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    tenantId: "1f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    name: "Dr. Napat",
    role: "owner"
  }
}

interface Recorded {
  signups: Record<string, unknown>[]
}

const recorded: Recorded = { signups: [] }

const apiError = (status: number, errorCode: string, message: string) =>
  HttpResponse.json({ statusCode: status, errorCode, message, requestId: "r" }, { status })

interface HandlerOptions {
  response?: () => Response
  delayMs?: number
}

const handlers = (options: HandlerOptions = {}) => [
  http.post(`${API}/auth/signup`, async ({ request }) => {
    recorded.signups.push((await request.json()) as Record<string, unknown>)
    if (options.delayMs) await delay(options.delayMs)
    return options.response?.() ?? HttpResponse.json(session)
  })
]

const mount = () => {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={["/signup"]}>
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/app/timeline" element={<h2>Timeline</h2>} />
      </Routes>
    </MemoryRouter>
  )
  return user
}

type User = ReturnType<typeof userEvent.setup>

const fill = async (user: User, overrides: Partial<Record<string, string>> = {}) => {
  const values = {
    "Clinic name": "Bright Smile Dental",
    "Your name": "Dr. Napat",
    Email: "napat@brightsmile.test",
    Password: "correct-horse",
    ...overrides
  }
  for (const [label, value] of Object.entries(values)) {
    if (!value) continue
    await user.type(screen.getByLabelText(label), value)
  }
}

describe("SignupPage", () => {
  beforeEach(() => {
    recorded.signups = []
    localStorage.clear()
  })

  it("labels every field and declares the types password managers need", () => {
    mount()

    expect(screen.getByLabelText("Clinic name")).toHaveAttribute("name", "clinicName")
    expect(screen.getByLabelText("Clinic URL")).toHaveAttribute("name", "slug")
    expect(screen.getByLabelText("Your name")).toHaveAttribute("name", "name")

    const email = screen.getByLabelText("Email")
    expect(email).toHaveAttribute("name", "email")
    expect(email).toHaveAttribute("type", "email")
    expect(email).toHaveAttribute("autocomplete", "email")

    const password = screen.getByLabelText("Password")
    expect(password).toHaveAttribute("name", "password")
    expect(password).toHaveAttribute("type", "password")
    expect(password).toHaveAttribute("autocomplete", "new-password")
  })

  it("marks nothing invalid before a submit and explains the clinic URL", () => {
    mount()

    for (const label of ["Clinic name", "Clinic URL", "Your name", "Email", "Password"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "false")
    }
    expect(screen.getByLabelText("Clinic URL")).toHaveAccessibleDescription(
      /Latin letters, numbers and hyphens/
    )
  })

  it("follows the clinic name into the URL field until the URL is edited", async () => {
    const user = mount()
    const slug = screen.getByLabelText("Clinic URL")

    await user.type(screen.getByLabelText("Clinic name"), "Bright Smile")
    expect(slug).toHaveValue("bright-smile")

    await user.clear(slug)
    await user.type(slug, "brightsmile")
    await user.type(screen.getByLabelText("Clinic name"), " Dental")

    expect(screen.getByLabelText("Clinic name")).toHaveValue("Bright Smile Dental")
    expect(slug).toHaveValue("brightsmile")
  })

  it("leaves the URL empty for a Thai clinic name rather than inventing one", async () => {
    const user = mount()

    await user.type(screen.getByLabelText("Clinic name"), "ยิ้มสวย ทันตคลินิก")

    expect(screen.getByLabelText("Clinic URL")).toHaveValue("")
  })

  it("shows a short password under its own field and sends nothing", async () => {
    server.use(...handlers())
    const user = mount()
    await fill(user, { Password: "short12" })

    await user.click(screen.getByRole("button", { name: "Create clinic" }))

    const password = screen.getByLabelText("Password")
    expect(password).toHaveAttribute("aria-invalid", "true")
    expect(password).toHaveAccessibleDescription("At least 8 characters")
    expect(recorded.signups).toHaveLength(0)
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "false")
  })

  it("moves focus to the first field that failed validation", async () => {
    const user = mount()

    await user.click(screen.getByRole("button", { name: "Create clinic" }))

    expect(screen.getByLabelText("Clinic name")).toHaveFocus()
  })

  it("refuses a clinic URL the API's pattern would reject", async () => {
    server.use(...handlers())
    const user = mount()
    await fill(user)
    const slug = screen.getByLabelText("Clinic URL")
    await user.clear(slug)
    await user.type(slug, "Bright Smile!")

    await user.click(screen.getByRole("button", { name: "Create clinic" }))

    expect(slug).toHaveAttribute("aria-invalid", "true")
    expect(slug).toHaveAccessibleDescription(/Latin letters, numbers and hyphens/)
    expect(recorded.signups).toHaveLength(0)
    expect(slug).toHaveFocus()
  })

  it("sends exactly what SignupDto asks for", async () => {
    server.use(...handlers())
    const user = mount()
    await fill(user)

    await user.click(screen.getByRole("button", { name: "Create clinic" }))

    await waitFor(() => expect(recorded.signups).toHaveLength(1))
    expect(recorded.signups[0]).toEqual({
      clinicName: "Bright Smile Dental",
      slug: "bright-smile-dental",
      name: "Dr. Napat",
      email: "napat@brightsmile.test",
      password: "correct-horse"
    })
  })

  it("puts a 409 SLUG_TAKEN under the clinic URL field and focuses it", async () => {
    server.use(
      ...handlers({
        response: () => apiError(409, "SLUG_TAKEN", "That clinic URL is already in use")
      })
    )
    const user = mount()
    await fill(user)

    await user.click(screen.getByRole("button", { name: "Create clinic" }))

    const slug = await screen.findByLabelText("Clinic URL")
    await waitFor(() => expect(slug).toHaveAttribute("aria-invalid", "true"))
    expect(slug).toHaveAccessibleDescription(/That clinic URL is already in use/)
    expect(slug).toHaveFocus()
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Clinic name")).toHaveValue("Bright Smile Dental")
  })

  it("announces an unmapped server failure once, at form level", async () => {
    server.use(...handlers({ response: () => apiError(500, "INTERNAL", "Something exploded") }))
    const user = mount()
    await fill(user)

    await user.click(screen.getByRole("button", { name: "Create clinic" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Something exploded")
    expect(screen.getByLabelText("Clinic URL")).toHaveAttribute("aria-invalid", "false")
  })

  it("says what it is doing and disables the button while the request is in flight", async () => {
    server.use(...handlers({ delayMs: 40 }))
    const user = mount()
    await fill(user)

    await user.click(screen.getByRole("button", { name: "Create clinic" }))

    const pending = await screen.findByRole("button", { name: "Creating your clinic…" })
    expect(pending).toBeDisabled()
    await screen.findByRole("heading", { name: "Timeline" })
  })

  it("stores a real session, not a demo one, and lands on the timeline", async () => {
    server.use(...handlers())
    const user = mount()
    await fill(user)

    await user.click(screen.getByRole("button", { name: "Create clinic" }))

    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeInTheDocument()
    expect(getSession()).toEqual(session)
    expect(isDemo()).toBe(false)
  })

  it("remembers the clinic URL so the login screen can prefill it", async () => {
    server.use(...handlers())
    const user = mount()
    await fill(user)

    await user.click(screen.getByRole("button", { name: "Create clinic" }))

    await screen.findByRole("heading", { name: "Timeline" })
    expect(localStorage.getItem(LAST_CLINIC_KEY)).toBe("bright-smile-dental")
    expect(LAST_CLINIC_KEY).toBe("dentalops.lastClinic")
  })

  it("still signs the owner in when storage refuses to write", async () => {
    server.use(...handlers())
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError")
    })
    const user = mount()
    await fill(user)

    await user.click(screen.getByRole("button", { name: "Create clinic" }))

    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeInTheDocument()
    expect(getSession()).toEqual(session)
    setItem.mockRestore()
  })
})
