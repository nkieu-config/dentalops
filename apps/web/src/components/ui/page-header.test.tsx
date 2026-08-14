import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Button } from "./button"
import { PageHeader } from "./page-header"

describe("PageHeader", () => {
  it("keeps page context before its scoped action", () => {
    render(
      <PageHeader title="Clinic settings" description="Manage how patients find and book your clinic.">
        <Button>Save changes</Button>
      </PageHeader>
    )

    const header = screen.getByRole("banner")
    expect(header).toHaveTextContent("Clinic settings")
    expect(header).toHaveTextContent("Manage how patients find and book your clinic.")
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("type-page-title")
    expect(screen.getByText("Manage how patients find and book your clinic.")).toHaveClass(
      "type-supporting"
    )
  })
})
