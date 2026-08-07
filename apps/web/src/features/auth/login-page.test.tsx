import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
import { afterEach, describe, expect, it } from "vitest"
import { getSession } from "../../lib/session"
import { API, delay, http, HttpResponse, server } from "../../test/msw"
import { LoginPage } from "./login-page"

const session = {
  accessToken: "header.payload.signature",
  user: {
    id: "1f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    tenantId: "2f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    name: "Dr. Anong",
    role: "owner"
  }
}

interface Recorded {
  bodies: unknown[]
}

const recordLogin = (respond: () => Response | Promise<Response>): Recorded => {
  const recorded: Recorded = { bodies: [] }
  server.use(
    http.post(`${API}/auth/login`, async ({ request }) => {
      recorded.bodies.push(await request.json())
      return respond()
    })
  )
  return recorded
}

const ok = () => HttpResponse.json(session)

const unauthorized = () =>
  HttpResponse.json(
    {
      statusCode: 401,
      errorCode: "INVALID_CREDENTIALS",
      message: "Wrong clinic, email, or password",
      requestId: "req-401"
    },
    { status: 401 }
  )

const renderLogin = (entry = "/login") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<h1>Create a clinic</h1>} />
        <Route path="/app/timeline" element={<h1>Timeline</h1>} />
      </Routes>
    </MemoryRouter>
  )

const fillCredentials = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText("Email"), "owner@clinic.test")
  await user.type(screen.getByLabelText("Password"), "correct-horse")
}

afterEach(() => {
  localStorage.clear()
})

describe("LoginPage prefill", () => {
  it("prefills the clinic URL from localStorage when the query is absent", () => {
    localStorage.setItem("dentalops.lastClinic", "smile-dental")
    renderLogin()

    expect(screen.getByLabelText("Clinic URL")).toHaveValue("smile-dental")
  })

  it("lets ?clinic= beat the remembered clinic", () => {
    localStorage.setItem("dentalops.lastClinic", "smile-dental")
    renderLogin("/login?clinic=bright-teeth")

    expect(screen.getByLabelText("Clinic URL")).toHaveValue("bright-teeth")
  })

  it("starts empty when neither source has a clinic", () => {
    renderLogin()

    expect(screen.getByLabelText("Clinic URL")).toHaveValue("")
  })

  it("renders even when localStorage is unreadable", () => {
    const getItem = Storage.prototype.getItem
    Storage.prototype.getItem = () => {
      throw new Error("Access to storage is denied")
    }
    try {
      renderLogin()
      expect(screen.getByLabelText("Clinic URL")).toHaveValue("")
    } finally {
      Storage.prototype.getItem = getItem
    }
  })
})

describe("LoginPage inputs", () => {
  it("sets a clinic-specific welcome context", () => {
    renderLogin()

    expect(screen.getByRole("heading", { name: "Welcome back to your clinic" })).toBeVisible()
  })

  it("declares the types and autocomplete hints a password manager needs", () => {
    renderLogin()

    const slug = screen.getByLabelText("Clinic URL")
    expect(slug).toHaveAttribute("name", "clinicSlug")
    expect(slug).toHaveAttribute("autocomplete", "organization")

    const email = screen.getByLabelText("Email")
    expect(email).toHaveAttribute("name", "email")
    expect(email).toHaveAttribute("type", "email")
    expect(email).toHaveAttribute("autocomplete", "email")

    const password = screen.getByLabelText("Password")
    expect(password).toHaveAttribute("name", "password")
    expect(password).toHaveAttribute("type", "password")
    expect(password).toHaveAttribute("autocomplete", "current-password")
    expect(screen.getByRole("button", { name: "Show password" })).toBeVisible()
  })

  it("reveals the password only when the patient asks", async () => {
    const user = userEvent.setup()
    renderLogin()

    await user.click(screen.getByRole("button", { name: "Show password" }))

    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text")
    expect(screen.getByRole("button", { name: "Hide password" })).toBeVisible()
  })

  it("explains where the clinic URL comes from", () => {
    renderLogin()

    expect(screen.getByLabelText("Clinic URL")).toHaveAccessibleDescription(
      "The clinic URL you chose at signup."
    )
  })

  it("offers a way to create a clinic instead", () => {
    renderLogin()

    expect(screen.getByRole("link", { name: "Create a clinic" })).toHaveAttribute("href", "/signup")
  })
})

describe("LoginPage validation", () => {
  it("marks a field invalid only once it has an error, and describes it with the message", async () => {
    const user = userEvent.setup()
    const recorded = recordLogin(ok)
    renderLogin()

    const slug = screen.getByLabelText("Clinic URL")
    expect(slug).toHaveAttribute("aria-invalid", "false")

    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(slug).toHaveAttribute("aria-invalid", "true")
    expect(slug).toHaveAccessibleDescription(
      "Latin letters, numbers and hyphens, 3 to 40 characters. The clinic URL you chose at signup."
    )
    expect(recorded.bodies).toHaveLength(0)
  })

  it("moves focus to the first invalid field", async () => {
    const user = userEvent.setup()
    recordLogin(ok)
    renderLogin("/login?clinic=bright-teeth")

    await user.type(screen.getByLabelText("Email"), "not-an-email")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(screen.getByLabelText("Email")).toHaveFocus()
  })

  it("accepts any non-empty password, as the API does", async () => {
    const user = userEvent.setup()
    const recorded = recordLogin(ok)
    renderLogin("/login?clinic=bright-teeth")

    await user.type(screen.getByLabelText("Email"), "owner@clinic.test")
    await user.type(screen.getByLabelText("Password"), "old")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => expect(recorded.bodies).toHaveLength(1))
    expect(recorded.bodies[0]).toMatchObject({ password: "old" })
  })

  it("requires a password", async () => {
    const user = userEvent.setup()
    const recorded = recordLogin(ok)
    renderLogin("/login?clinic=bright-teeth")

    await user.type(screen.getByLabelText("Email"), "owner@clinic.test")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription("Enter your password")
    expect(recorded.bodies).toHaveLength(0)
  })
})

describe("LoginPage submit", () => {
  it("sends the clinic slug, email and password and nothing else", async () => {
    const user = userEvent.setup()
    const recorded = recordLogin(ok)
    renderLogin("/login?clinic=bright-teeth")
    await fillCredentials(user)

    await user.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => expect(recorded.bodies).toHaveLength(1))
    expect(recorded.bodies[0]).toEqual({
      clinicSlug: "bright-teeth",
      email: "owner@clinic.test",
      password: "correct-horse"
    })
  })

  it("stores a real session and lands on the timeline", async () => {
    const user = userEvent.setup()
    recordLogin(ok)
    renderLogin("/login?clinic=bright-teeth")
    await fillCredentials(user)

    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByRole("heading", { name: "Timeline" })).toBeInTheDocument()
    expect(getSession()).toEqual(session)
  })

  it("remembers the clinic for the next visit", async () => {
    const user = userEvent.setup()
    recordLogin(ok)
    renderLogin("/login?clinic=bright-teeth")
    await fillCredentials(user)

    await user.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() =>
      expect(localStorage.getItem("dentalops.lastClinic")).toBe("bright-teeth")
    )
  })

  it("disables the button and says what it is doing while the request is in flight", async () => {
    const user = userEvent.setup()
    recordLogin(async () => {
      await delay(50)
      return ok()
    })
    renderLogin("/login?clinic=bright-teeth")
    await fillCredentials(user)

    await user.click(screen.getByRole("button", { name: "Sign in" }))

    const pending = await screen.findByRole("button", { name: "Signing you in…" })
    expect(pending).toBeDisabled()
    await screen.findByRole("heading", { name: "Timeline" })
  })
})

describe("LoginPage failure", () => {
  it("shows one message that does not say whether the email or the password was wrong", async () => {
    const user = userEvent.setup()
    recordLogin(unauthorized)
    renderLogin("/login?clinic=bright-teeth")
    await fillCredentials(user)

    await user.click(screen.getByRole("button", { name: "Sign in" }))

    const alerts = await screen.findAllByRole("alert")
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toHaveTextContent(
      "We could not sign you in. Check the clinic URL, email and password, then try again."
    )
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "false")
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "false")
  })

  it("keeps the typed email and clinic so only the password has to be retyped", async () => {
    const user = userEvent.setup()
    recordLogin(unauthorized)
    renderLogin("/login?clinic=bright-teeth")
    await fillCredentials(user)

    await user.click(screen.getByRole("button", { name: "Sign in" }))

    await screen.findByRole("alert")
    expect(screen.getByLabelText("Email")).toHaveValue("owner@clinic.test")
    expect(screen.getByLabelText("Clinic URL")).toHaveValue("bright-teeth")
    expect(getSession()).toBeNull()
  })

  it("does not remember a clinic a failed login could not reach", async () => {
    const user = userEvent.setup()
    recordLogin(unauthorized)
    renderLogin("/login?clinic=bright-teeth")
    await fillCredentials(user)

    await user.click(screen.getByRole("button", { name: "Sign in" }))

    await screen.findByRole("alert")
    expect(localStorage.getItem("dentalops.lastClinic")).toBeNull()
  })

  it("reports a server failure without pretending it was the credentials", async () => {
    const user = userEvent.setup()
    recordLogin(() =>
      HttpResponse.json(
        {
          statusCode: 503,
          errorCode: "DATABASE_ASLEEP",
          message: "The API is waking up",
          requestId: "req-503"
        },
        { status: 503 }
      )
    )
    renderLogin("/login?clinic=bright-teeth")
    await fillCredentials(user)

    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("The API is waking up")
  })
})
