import type { Appointment } from "@dentalops/contracts"
import { render, screen } from "../../test/render"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ServiceLegend } from "./service-legend"

const appointment = (serviceId: string, name: string, colorIndex: number): Appointment =>
  ({
    id: `a-${serviceId}-${Math.round(colorIndex)}`,
    service: { id: serviceId, name, colorIndex }
  }) as Appointment

describe("ServiceLegend", () => {
  it("names every colour on the schedule and how many wear it", async () => {
    render(
      <ServiceLegend
        appointments={[
          appointment("s1", "Cleaning", 0),
          appointment("s2", "Extraction", 3),
          { ...appointment("s1", "Cleaning", 0), id: "a-dup" }
        ]}
      />
    )

    await userEvent.click(screen.getByTestId("service-legend-trigger"))

    const rows = screen.getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent("Cleaning")
    expect(rows[0]).toHaveTextContent("2")
    expect(rows[1]).toHaveTextContent("Extraction")
    expect(rows[1]).toHaveTextContent("1")
  })

  it("gives each service the swatch its cards are painted with", async () => {
    render(<ServiceLegend appointments={[appointment("s2", "Extraction", 3)]} />)

    await userEvent.click(screen.getByTestId("service-legend-trigger"))

    const swatch = screen.getByRole("listitem").firstElementChild
    expect(swatch?.getAttribute("style")).toContain("var(--hue3-bg)")
    expect(swatch?.getAttribute("style")).toContain("var(--hue3-border)")
  })

  it("stays out of the toolbar when the schedule has nothing to explain", () => {
    render(<ServiceLegend appointments={[]} />)

    expect(screen.queryByTestId("service-legend-trigger")).not.toBeInTheDocument()
  })
})
