import type { Branch } from "@dentalops/contracts"
import { render, screen } from "../../test/render"
import { describe, expect, it, vi } from "vitest"
import { bkkToday } from "./lib/geometry"
import { TimelineToolbar } from "./timeline-toolbar"

const branches: Branch[] = [{ id: "branch-1", name: "Sukhumvit", openingHours: {} }]

describe("TimelineToolbar", () => {
  it("groups the schedule controls in a named command surface", () => {
    render(
      <TimelineToolbar
        date="2026-08-03"
        branchId="branch-1"
        branches={branches}
        view="day"
        onChange={vi.fn()}
        onSearch={vi.fn()}
        primaryAction={<button type="button">New appointment</button>}
      />,
    )

    expect(screen.getByRole("heading", { level: 1, name: "Timeline" })).toBeVisible()
    expect(screen.getByTestId("timeline-command-surface")).toHaveClass("rounded-hero")
    expect(screen.getByTestId("timeline-command-layout")).toHaveClass("flex", "flex-col")
    expect(screen.getByRole("combobox", { name: "Branch" })).toHaveClass(
      "w-full",
      "sm:w-60",
      "sm:max-w-72",
      "rounded-full",
    )
    expect(screen.getByRole("button", { name: "Search this schedule" })).toHaveClass(
      "gap-2",
      "lg:min-w-28",
    )
    expect(screen.getByText("Branch", { selector: "[data-testid='app-select-prefix']" })).toBeVisible()
    expect(screen.getByRole("radio", { name: "Day" })).toBeVisible()
    expect(screen.getByRole("radio", { name: "Week" })).toBeVisible()
  })

  it("keeps date navigation at a 44px nonshrinking contract", () => {
    render(
      <TimelineToolbar
        date="2026-08-03"
        branchId="branch-1"
        branches={branches}
        view="day"
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId("timeline-date-controls")).toHaveClass(
      "grid-cols-[auto_2.75rem_minmax(0,1fr)_2.75rem_auto]",
      "gap-2",
    )
    expect(screen.getByLabelText("Previous day")).toHaveClass("shrink-0", "h-11", "w-11", "[@media(pointer:coarse)]:h-11")
    expect(screen.getByLabelText("Next day")).toHaveClass("shrink-0", "h-11", "w-11", "[@media(pointer:coarse)]:h-11")
  })

  it("keeps tablet actions distributed instead of isolating the primary action", () => {
    render(
      <TimelineToolbar
        date="2026-08-03"
        branchId="branch-1"
        branches={branches}
        view="day"
        onChange={vi.fn()}
        onSearch={vi.fn()}
        primaryAction={<button type="button">New appointment</button>}
      >
        <button type="button">Dentists</button>
      </TimelineToolbar>,
    )

    expect(screen.getByTestId("timeline-command-context")).toContainElement(
      screen.getByRole("combobox", { name: "Branch" }),
    )
    expect(screen.getByTestId("timeline-primary-action")).toHaveClass("ml-auto")
    expect(screen.getByTestId("timeline-command-context")).toContainElement(
      screen.getByTestId("timeline-primary-action"),
    )
    expect(screen.getByTestId("timeline-date-controls")).toContainElement(
      screen.getByTestId("timeline-search-action"),
    )
    expect(screen.getByTestId("timeline-mode-actions")).toContainElement(
      screen.getByRole("button", { name: "Dentists" }),
    )
  })

  it("keeps date navigation and mode controls on one wrapping row so neither can sit on the other", () => {
    render(
      <TimelineToolbar
        date="2026-08-03"
        branchId="branch-1"
        branches={branches}
        view="day"
        onChange={vi.fn()}
        onSearch={vi.fn()}
      >
        <button type="button">Columns</button>
      </TimelineToolbar>,
    )

    const row = screen.getByTestId("timeline-schedule-row")
    expect(row).toHaveClass("flex", "flex-wrap")
    expect(row).toContainElement(screen.getByTestId("timeline-date-controls"))
    expect(row).toContainElement(screen.getByTestId("timeline-mode-actions"))
    expect(screen.getByTestId("timeline-date-controls").className).not.toContain("row-start")
    expect(screen.getByTestId("timeline-mode-actions").className).not.toContain("row-start")
  })

  it("places desktop search and creation at the trailing edge without duplicating controls", () => {
    render(
      <TimelineToolbar
        date="2026-08-03"
        branchId="branch-1"
        branches={branches}
        view="day"
        onChange={vi.fn()}
        onSearch={vi.fn()}
        primaryAction={<button type="button">New appointment</button>}
      >
        <button type="button">Dentists</button>
      </TimelineToolbar>,
    )

    expect(screen.getAllByRole("button", { name: "Search this schedule" })).toHaveLength(1)
    expect(screen.getAllByRole("button", { name: "New appointment" })).toHaveLength(1)
    expect(screen.getByTestId("timeline-primary-action")).toHaveClass("ml-auto")
    expect(screen.getByTestId("timeline-mode-actions")).toHaveClass("xl:ml-auto")
  })

  it("exposes a portable search shortcut and marks the current date", () => {
    render(
      <TimelineToolbar
        date={bkkToday()}
        branchId="branch-1"
        branches={branches}
        view="day"
        onChange={vi.fn()}
        onSearch={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Search this schedule" })).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+K Control+K",
    )
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-current", "date")
  })

  it("leaves the shortcut to the tooltip instead of printing it beside the word Search", () => {
    render(
      <TimelineToolbar
        date="2026-08-03"
        branchId="branch-1"
        branches={branches}
        view="day"
        onChange={vi.fn()}
        onSearch={vi.fn()}
      />,
    )

    const search = screen.getByRole("button", { name: "Search this schedule" })
    expect(search.querySelector("kbd")).toBeNull()
    expect(search).toHaveAttribute("aria-keyshortcuts", "Meta+K Control+K")
  })
})
