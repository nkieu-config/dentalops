import { CheckCircle2, TriangleAlert } from "lucide-react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { StatusCallout } from "./status-callout"

describe("StatusCallout", () => {
  it("pairs warning text with an icon instead of relying on colour", () => {
    render(
      <StatusCallout tone="warning" icon={TriangleAlert} title="Needs attention">
        Check the affected appointments before saving.
      </StatusCallout>
    )

    expect(screen.getByRole("status")).toHaveTextContent("Needs attention")
    expect(screen.getByText("Check the affected appointments before saving.")).toBeInTheDocument()
    expect(screen.getByTestId("status-callout-icon")).toBeInTheDocument()
  })

  it("announces destructive context urgently", () => {
    render(<StatusCallout tone="destructive" icon={CheckCircle2} title="Booking cancelled" />)
    expect(screen.getByRole("alert")).toHaveTextContent("Booking cancelled")
  })
})
