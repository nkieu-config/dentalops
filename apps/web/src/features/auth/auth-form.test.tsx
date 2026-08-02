import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AuthCard, Field, FieldInput, FormError, SubmitButton } from "./auth-form"

describe("Field", () => {
  it("associates its label with the input the caller renders", () => {
    render(
      <Field id="email" label="Email">
        {(aria) => <FieldInput {...aria} name="email" type="email" autoComplete="email" />}
      </Field>
    )

    const input = screen.getByLabelText("Email")
    expect(input).toHaveAttribute("id", "email")
    expect(input).toHaveAttribute("type", "email")
    expect(input).toHaveAttribute("autocomplete", "email")
  })

  it("is not invalid and has no description when there is no error or hint", () => {
    render(
      <Field id="email" label="Email">
        {(aria) => <FieldInput {...aria} />}
      </Field>
    )

    const input = screen.getByLabelText("Email")
    expect(input).toHaveAttribute("aria-invalid", "false")
    expect(input).not.toHaveAccessibleDescription()
  })

  it("marks the input invalid and describes it with the error text", () => {
    render(
      <Field id="password" label="Password" error="At least 8 characters">
        {(aria) => <FieldInput {...aria} type="password" />}
      </Field>
    )

    const input = screen.getByLabelText("Password")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAccessibleDescription("At least 8 characters")
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument()
  })

  it("describes the input with its hint when there is no error", () => {
    render(
      <Field id="slug" label="Clinic URL" hint="Latin letters, numbers and hyphens">
        {(aria) => <FieldInput {...aria} />}
      </Field>
    )

    const input = screen.getByLabelText("Clinic URL")
    expect(input).toHaveAttribute("aria-invalid", "false")
    expect(input).toHaveAccessibleDescription("Latin letters, numbers and hyphens")
  })

  it("reads the error before the hint when both are present", () => {
    render(
      <Field id="slug" label="Clinic URL" hint="Becomes your booking link" error="Already taken">
        {(aria) => <FieldInput {...aria} />}
      </Field>
    )

    expect(screen.getByLabelText("Clinic URL")).toHaveAccessibleDescription(
      "Already taken Becomes your booking link"
    )
  })
})

describe("FieldInput", () => {
  it("clears 44px on mobile and may shrink from the sm breakpoint up", () => {
    render(
      <Field id="email" label="Email">
        {(aria) => <FieldInput {...aria} />}
      </Field>
    )

    const input = screen.getByLabelText("Email")
    expect(input).toHaveClass("h-11")
    expect(input).toHaveClass("sm:h-9")
    expect(input).not.toHaveClass("h-9")
  })
})

describe("FormError", () => {
  it("renders nothing when there is no form error", () => {
    const { container } = render(<FormError message={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("announces a form level error", () => {
    render(<FormError message="Email or password is wrong" />)
    expect(screen.getByRole("alert")).toHaveTextContent("Email or password is wrong")
  })
})

describe("SubmitButton", () => {
  it("submits the form it sits in and is enabled when idle", () => {
    render(
      <SubmitButton pending={false} pendingLabel="Creating your clinic…">
        Create clinic
      </SubmitButton>
    )

    const button = screen.getByRole("button", { name: "Create clinic" })
    expect(button).toHaveAttribute("type", "submit")
    expect(button).toBeEnabled()
  })

  it("says what it is doing and disables itself while pending", () => {
    render(
      <SubmitButton pending pendingLabel="Creating your clinic…">
        Create clinic
      </SubmitButton>
    )

    const button = screen.getByRole("button", { name: "Creating your clinic…" })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
  })
})

describe("AuthCard", () => {
  it("gives the screen one main landmark and one first level heading", () => {
    render(
      <AuthCard title="Create a clinic" subtitle="Two minutes, no card">
        <p>form goes here</p>
      </AuthCard>
    )

    expect(screen.getByRole("main")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "Create a clinic" })).toBeInTheDocument()
    expect(screen.getByText("Two minutes, no card")).toBeInTheDocument()
    expect(screen.getByText("form goes here")).toBeInTheDocument()
  })
})
