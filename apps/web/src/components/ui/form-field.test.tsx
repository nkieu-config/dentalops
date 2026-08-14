import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AppSelect } from "./app-select"
import { Field, FieldInput, FormError, SubmitButton } from "./form-field"

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
  it("clears 44px on mobile and never drops below 40px", () => {
    render(
      <Field id="email" label="Email">
        {(aria) => <FieldInput {...aria} />}
      </Field>
    )

    const input = screen.getByLabelText("Email")
    expect(input).toHaveClass("h-11")
    expect(input).toHaveClass("sm:h-10")
    expect(input).not.toHaveClass("h-9")
  })

  it("keeps typed text at 16px on every width, so iOS never zooms on focus", () => {
    render(
      <Field id="email" label="Email">
        {(aria) => <FieldInput {...aria} />}
      </Field>
    )

    const input = screen.getByLabelText("Email")
    expect(input).toHaveClass("type-body")
    expect(input).not.toHaveClass("sm:type-ui")
  })

  it("stands exactly as tall as the select it can sit beside", () => {
    render(
      <>
        <Field id="name" label="Name">
          {(aria) => <FieldInput {...aria} />}
        </Field>
        <Field id="role" label="Role">
          {(aria) => (
            <AppSelect {...aria} value="dentist" onValueChange={() => {}} options={[{ value: "dentist", label: "Dentist" }]} />
          )}
        </Field>
      </>
    )

    const heights = ["h-11", "sm:h-10"]
    const input = screen.getByLabelText("Name")
    const select = screen.getByLabelText("Role")
    for (const height of heights) {
      expect(input).toHaveClass(height)
      expect(select).toHaveClass(height)
    }
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

describe("errors do not rely on colour", () => {
  it("gives a field error and a form error an icon as well as a hue", () => {
    const { container: fieldBox } = render(
      <Field id="email" label="Email" error="That email is already in use">
        {(aria) => <FieldInput {...aria} />}
      </Field>
    )
    expect(fieldBox.querySelector("svg")).toBeInTheDocument()

    const { container: formBox } = render(<FormError message="We could not sign you in" />)
    expect(formBox.querySelector("svg")).toBeInTheDocument()
  })

  it("never mixes a semantic colour with opacity, which no contrast check can verify", () => {
    render(<FormError message="We could not sign you in" />)
    expect(screen.getByRole("alert").className).not.toMatch(
      /(bg|text|border)-(destructive|warning|success)\//
    )
  })
})
