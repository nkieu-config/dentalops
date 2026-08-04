import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Card, CardBody, CardDescription, CardHeader, CardTitle } from "./card"

describe("Card", () => {
  it("separates by border, never by shadow", () => {
    render(<Card data-testid="card">content</Card>)
    const className = screen.getByTestId("card").className
    expect(className).toContain("border-border")
    expect(className).not.toMatch(/\bshadow-(xs|sm|md|lg)\b/)
  })

  it("gives its title a heading role so a screen reader can navigate by it", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Opening hours</CardTitle>
          <CardDescription>When this branch takes bookings</CardDescription>
        </CardHeader>
        <CardBody>Mon to Fri</CardBody>
      </Card>
    )
    expect(screen.getByRole("heading", { name: "Opening hours" })).toBeInTheDocument()
    expect(screen.getByText("When this branch takes bookings")).toBeInTheDocument()
    expect(screen.getByText("Mon to Fri")).toBeInTheDocument()
  })
})
