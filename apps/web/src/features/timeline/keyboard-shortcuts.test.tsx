import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { KeyboardShortcuts } from "./keyboard-shortcuts"

const open = (props: Partial<Parameters<typeof KeyboardShortcuts>[0]> = {}) =>
  render(
    <KeyboardShortcuts
      open
      onOpenChange={() => {}}
      searchShortcut="⌘ K"
      {...props}
    />,
  )

describe("KeyboardShortcuts", () => {
  it("splits the search shortcut into the keys the user actually presses", () => {
    open()

    const row = screen.getByText("Search this schedule").closest("li")
    expect(row).not.toBeNull()
    expect(within(row!).getByText("⌘")).toBeInTheDocument()
    expect(within(row!).getByText("K")).toBeInTheDocument()
  })

  it("matches the platform it is shown on rather than always claiming Command", () => {
    open({ searchShortcut: "Ctrl K" })

    const row = screen.getByText("Search this schedule").closest("li")
    expect(within(row!).getByText("Ctrl")).toBeInTheDocument()
  })

  it("hides the editing keys from a reader who cannot move a booking", () => {
    open({ canMove: false })

    expect(screen.queryByText("Start 15 min earlier")).not.toBeInTheDocument()
    expect(screen.getByText("Earlier")).toBeInTheDocument()
    expect(screen.getByText(/role cannot change this schedule/)).toBeInTheDocument()
  })

  it("names the touch path so a tablet user is not left hunting for keys", () => {
    open({ canMove: true })

    expect(screen.getByText("Start 15 min earlier")).toBeInTheDocument()
    expect(screen.getByText(/open it and choose Reschedule/)).toBeInTheDocument()
  })

  it("stays shut until it is asked for", () => {
    render(
      <KeyboardShortcuts open={false} onOpenChange={() => {}} searchShortcut="⌘ K" />,
    )

    expect(screen.queryByTestId("keyboard-shortcuts")).not.toBeInTheDocument()
  })
})
