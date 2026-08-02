import { act, render, renderHook, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { FormEvent } from "react"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { ApiError } from "../../lib/api"
import { useAuthForm } from "./use-auth-form"

const schema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters")
})

const initial = { email: "", password: "" }

const submitEvent = () => ({ preventDefault: () => {} }) as FormEvent

const setup = (options: {
  onSubmit?: (values: z.infer<typeof schema>) => Promise<void>
  fieldForErrorCode?: (code: string) => string | null
}) => {
  const onSubmit = options.onSubmit ?? vi.fn(async () => {})
  const view = renderHook(() =>
    useAuthForm({
      schema,
      initial,
      onSubmit,
      fieldForErrorCode: options.fieldForErrorCode
    })
  )
  return { ...view, onSubmit }
}

const Harness = ({
  onSubmit,
  fieldForErrorCode
}: {
  onSubmit: (values: z.infer<typeof schema>) => Promise<void>
  fieldForErrorCode?: (code: string) => string | null
}) => {
  const form = useAuthForm({ schema, initial, onSubmit, fieldForErrorCode })
  return (
    <form ref={form.formRef} onSubmit={form.submit} noValidate>
      <input
        name="email"
        aria-label="Email"
        value={form.values.email}
        onChange={(e) => form.set("email", e.target.value)}
      />
      <input
        name="password"
        aria-label="Password"
        value={form.values.password}
        onChange={(e) => form.set("password", e.target.value)}
      />
      <button type="submit">Continue</button>
    </form>
  )
}

describe("useAuthForm", () => {
  it("keeps the initial values and no errors before a submit", () => {
    const { result } = setup({})
    expect(result.current.values).toEqual(initial)
    expect(result.current.errors).toEqual({})
    expect(result.current.formError).toBeNull()
    expect(result.current.pending).toBe(false)
  })

  it("populates errors keyed by field path and never calls onSubmit", async () => {
    const onSubmit = vi.fn(async () => {})
    const { result } = setup({ onSubmit })

    await act(async () => {
      result.current.submit(submitEvent())
    })

    expect(result.current.errors).toEqual({
      email: "Enter a valid email",
      password: "At least 8 characters"
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it("calls onSubmit once with the parsed value", async () => {
    const onSubmit = vi.fn(async () => {})
    const { result } = setup({ onSubmit })

    act(() => {
      result.current.set("email", "owner@clinic.test")
      result.current.set("password", "correct-horse")
    })
    await act(async () => {
      result.current.submit(submitEvent())
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      email: "owner@clinic.test",
      password: "correct-horse"
    })
    expect(result.current.errors).toEqual({})
    expect(result.current.formError).toBeNull()
  })

  it("is pending only while the submit promise is unsettled", async () => {
    let settle = () => {}
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve
        })
    )
    const { result } = setup({ onSubmit })

    act(() => {
      result.current.set("email", "owner@clinic.test")
      result.current.set("password", "correct-horse")
    })
    expect(result.current.pending).toBe(false)

    act(() => {
      result.current.submit(submitEvent())
    })
    await waitFor(() => expect(result.current.pending).toBe(true))

    await act(async () => {
      settle()
    })
    expect(result.current.pending).toBe(false)
  })

  it("ignores a second submit while the first is in flight", async () => {
    let settle = () => {}
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve
        })
    )
    const { result } = setup({ onSubmit })

    act(() => {
      result.current.set("email", "owner@clinic.test")
      result.current.set("password", "correct-horse")
    })
    act(() => {
      result.current.submit(submitEvent())
    })
    act(() => {
      result.current.submit(submitEvent())
    })

    expect(onSubmit).toHaveBeenCalledTimes(1)
    await act(async () => {
      settle()
    })
  })

  it("lands a mapped ApiError on its field", async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiError(409, "EMAIL_TAKEN", "Somebody in this clinic already uses that email")
    })
    const { result } = setup({
      onSubmit,
      fieldForErrorCode: (code) => (code === "EMAIL_TAKEN" ? "email" : null)
    })

    act(() => {
      result.current.set("email", "owner@clinic.test")
      result.current.set("password", "correct-horse")
    })
    await act(async () => {
      result.current.submit(submitEvent())
    })

    expect(result.current.errors.email).toBe("Somebody in this clinic already uses that email")
    expect(result.current.formError).toBeNull()
    expect(result.current.pending).toBe(false)
  })

  it("lands an unmapped ApiError in formError", async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is wrong")
    })
    const { result } = setup({
      onSubmit,
      fieldForErrorCode: (code) => (code === "EMAIL_TAKEN" ? "email" : null)
    })

    act(() => {
      result.current.set("email", "owner@clinic.test")
      result.current.set("password", "correct-horse")
    })
    await act(async () => {
      result.current.submit(submitEvent())
    })

    expect(result.current.formError).toBe("Email or password is wrong")
    expect(result.current.errors).toEqual({})
  })

  it("lands a non-api failure in formError too", async () => {
    const onSubmit = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    const { result } = setup({ onSubmit })

    act(() => {
      result.current.set("email", "owner@clinic.test")
      result.current.set("password", "correct-horse")
    })
    await act(async () => {
      result.current.submit(submitEvent())
    })

    expect(result.current.formError).toBe("Failed to fetch")
  })

  it("clears a field error as soon as that field is edited", async () => {
    const { result } = setup({})

    await act(async () => {
      result.current.submit(submitEvent())
    })
    expect(result.current.errors.email).toBe("Enter a valid email")
    expect(result.current.errors.password).toBe("At least 8 characters")

    act(() => {
      result.current.set("email", "o")
    })
    expect(result.current.errors.email).toBeUndefined()
    expect(result.current.errors.password).toBe("At least 8 characters")
  })
})

describe("useAuthForm focus", () => {
  it("moves focus to the first invalid field on a failed submit", async () => {
    const user = userEvent.setup()
    render(<Harness onSubmit={vi.fn(async () => {})} />)

    await user.click(screen.getByRole("button", { name: "Continue" }))

    expect(screen.getByLabelText("Email")).toHaveFocus()
  })

  it("skips a valid field when choosing where to put focus", async () => {
    const user = userEvent.setup()
    render(<Harness onSubmit={vi.fn(async () => {})} />)

    await user.type(screen.getByLabelText("Email"), "owner@clinic.test")
    await user.type(screen.getByLabelText("Password"), "short")
    await user.click(screen.getByRole("button", { name: "Continue" }))

    expect(screen.getByLabelText("Password")).toHaveFocus()
  })

  it("moves focus to the field a server error was mapped onto", async () => {
    const user = userEvent.setup()
    render(
      <Harness
        onSubmit={vi.fn(async () => {
          throw new ApiError(409, "EMAIL_TAKEN", "Already used")
        })}
        fieldForErrorCode={(code) => (code === "EMAIL_TAKEN" ? "email" : null)}
      />
    )

    await user.type(screen.getByLabelText("Email"), "owner@clinic.test")
    await user.type(screen.getByLabelText("Password"), "correct-horse")
    await user.click(screen.getByRole("button", { name: "Continue" }))

    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveFocus())
  })
})
