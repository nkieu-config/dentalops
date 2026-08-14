import { render, screen, within } from "../test/render"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import { OFFLINE_MESSAGE } from "../components/shell/offline-banner"
import { PHONE_ERROR } from "../lib/phone"
import { DevUiPage } from "./dev-ui-page"

const EXEMPT_FROM_GALLERY = new Set([
  "motion-provider",
  "focus-ring",
  "select-trigger-styles",
  "require-auth",
  "out-of-scope",
  "app-shell",
  "input",
  "label"
])

const renderGallery = () =>
  render(
    <MemoryRouter initialEntries={["/dev/ui"]}>
      <DevUiPage />
    </MemoryRouter>
  )

describe("DevUiPage", () => {
  it("renders every status treatment across the six service hues", () => {
    renderGallery()
    const gallery = within(screen.getByTestId("card-gallery"))

    expect(gallery.getAllByTestId(/^appt-/)).toHaveLength(24)
    expect(gallery.getAllByLabelText("Completed")).toHaveLength(6)
    expect(gallery.getAllByLabelText("No-show")).toHaveLength(6)

    const cancelled = gallery.getAllByLabelText("Cancelled")
    expect(cancelled).toHaveLength(6)
    expect(cancelled[0]!.closest("button")!.querySelector("span.line-through")).toHaveTextContent(
      "Cleaning"
    )
  })

  it("gives the dragged preview the only shadow and dims the card it came from", () => {
    renderGallery()
    const states = within(screen.getByTestId("card-states"))

    const preview = states.getByTestId("drag-preview")
    expect(preview.className).toContain("shadow-lg")
    expect(preview.className).toContain("pointer-events-none")
    expect(states.getByTestId("appt-f0000000-0000-4000-8000-000000000200").className).toContain(
      "opacity-40"
    )
    expect(
      states.queryAllByTestId(/^appt-/).filter((el) => el.className.includes("shadow-lg"))
    ).toEqual([])
  })

  it("marks the conflict card with a warning icon and keeps its service edge", () => {
    renderGallery()
    const states = within(screen.getByTestId("card-states"))

    const conflict = states.getByTestId("appt-f0000000-0000-4000-8000-000000000201")
    expect(conflict).toHaveStyle({ borderLeftColor: "var(--hue2-border)" })
    expect(within(conflict).getByLabelText("Conflict")).toBeInTheDocument()
  })

  it("renders the SlotPicker loading, populated and empty states without a server", () => {
    renderGallery()

    expect(within(screen.getByTestId("slots-loading")).getAllByTestId("slot-skeleton")).toHaveLength(
      8
    )

    const available = within(screen.getByTestId("slots-available"))
    expect(available.getAllByTestId("slot")).toHaveLength(4)
    expect(within(available.getByTestId("group-morning")).getAllByRole("button")).toHaveLength(2)
    expect(within(available.getByTestId("group-afternoon")).getAllByRole("button")).toHaveLength(2)
    expect(available.getByRole("button", { name: "13:00" })).toBeInTheDocument()

    const none = within(screen.getByTestId("slots-none"))
    expect(none.getByText("No free slots this day")).toBeInTheDocument()
    expect(none.queryAllByTestId("slot")).toHaveLength(0)

    const error = within(screen.getByTestId("slots-error"))
    expect(error.getByText("Could not load free slots")).toBeInTheDocument()
    expect(error.getByText("Check your connection and try again.")).toBeInTheDocument()
    expect(error.queryAllByTestId("slot")).toHaveLength(0)
  })

  it("renders the countdown at its normal, urgent and expired urgencies", () => {
    renderGallery()

    const normal = within(screen.getByTestId("countdown-normal")).getByTestId("hold-countdown")
    expect(normal).toHaveAttribute("data-urgency", "normal")
    expect(normal).toHaveTextContent("Holding 10:30 for")

    expect(
      within(screen.getByTestId("countdown-urgent")).getByTestId("hold-countdown")
    ).toHaveAttribute("data-urgency", "urgent")

    const expired = within(screen.getByTestId("countdown-expired")).getByTestId("hold-countdown")
    expect(expired).toHaveAttribute("data-urgency", "expired")
    expect(expired).toHaveTextContent("Your hold expired")
  })

  it("shows the slot picker while a hold is being acquired and both recovery states", () => {
    renderGallery()

    const pending = within(screen.getByTestId("hold-pending"))
    expect(pending.getAllByTestId("slot")).toHaveLength(4)
    expect(pending.getByText("Holding that time for you…")).toBeInTheDocument()

    const expired = within(screen.getByTestId("hold-expired"))
    expect(expired.getByText("Your hold expired")).toBeInTheDocument()
    expect(expired.getByText(/10:30 was taken\. Nearest free: 13:00\./)).toBeInTheDocument()
    expect(expired.queryAllByTestId("slot")).toHaveLength(0)

    const taken = within(screen.getByTestId("hold-taken"))
    expect(taken.getByText("That time was just booked")).toBeInTheDocument()
    expect(taken.queryByText(/Nearest free/)).not.toBeInTheDocument()
    expect(taken.getByRole("button", { name: "Pick another time" })).toBeInTheDocument()
  })

  it("shows the overlapping fixture pair side by side in the TimeGrid section", () => {
    renderGallery()
    const grid = within(screen.getByTestId("lane-grid"))

    const first = grid.getByTestId("appt-f0000000-0000-4000-8000-000000000101")
    const second = grid.getByTestId("appt-f0000000-0000-4000-8000-000000000102")
    const other = grid.getByTestId("appt-f0000000-0000-4000-8000-000000000103")

    expect(first.style.left).toBe("calc(0% + 2px)")
    expect(first.style.width).toBe("calc(50% - 4px)")
    expect(second.style.left).toBe("calc(50% + 2px)")
    expect(other.style.width).toBe("calc(100% - 4px)")
    expect(grid.getAllByTestId(/^col-/)).toHaveLength(2)
  })

  it("mounts the perf fixture across eight columns only after the button is pressed", async () => {
    renderGallery()
    expect(screen.queryByTestId("perf-grid")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Render 1,000 cards" }))

    const perf = within(screen.getByTestId("perf-grid"))
    expect(perf.getAllByTestId(/^col-/)).toHaveLength(8)
    expect(perf.getAllByTestId(/^appt-/).length).toBeGreaterThan(0)
  })

  it("renders the ShiftBlock saved, dragging, recurring and conflicting states", () => {
    renderGallery()

    const saved = within(screen.getByTestId("shift-state-saved"))
    expect(saved.getByTestId("shift-edit-f0000000-0000-4000-8000-000000000530")).toHaveTextContent("09:00–17:00")
    expect(saved.getByTestId("shift-drag-f0000000-0000-4000-8000-000000000530")).toBeInTheDocument()
    expect(saved.queryByLabelText("Recurring")).not.toBeInTheDocument()
    expect(saved.queryByLabelText("Blocking violation")).not.toBeInTheDocument()

    const dragging = within(screen.getByTestId("shift-state-dragging")).getByTestId(
      "shift-f0000000-0000-4000-8000-000000000531"
    )
    expect(dragging).toHaveAttribute("data-dragging", "true")
    expect(dragging).toHaveTextContent("Validating…")
    expect(dragging.className).toContain("border-dashed")

    expect(
      within(screen.getByTestId("shift-state-recurring")).getByLabelText("Recurring")
    ).toBeInTheDocument()

    const conflicting = within(screen.getByTestId("shift-state-conflicting"))
    expect(conflicting.getByTestId("shift-f0000000-0000-4000-8000-000000000533").className).toContain("border-destructive")
    expect(conflicting.getByLabelText("Blocking violation")).toBeInTheDocument()
  })

  it("renders the ViolationList clean and warnings-only states", () => {
    renderGallery()

    const clean = within(screen.getByTestId("violations-state-clean"))
    expect(clean.getByTestId("violations-clean")).toHaveTextContent("No violations")
    expect(clean.queryByTestId("violations-blocking")).not.toBeInTheDocument()

    const warnings = within(screen.getByTestId("violations-state-warnings"))
    expect(warnings.getByTestId("violations-warnings")).toHaveTextContent("Worth checking (2)")
    expect(warnings.getByText("Dr. Anong")).toBeInTheDocument()
    expect(warnings.getByText("Dr. Boon")).toBeInTheDocument()
    expect(warnings.getAllByLabelText("Worth checking")).toHaveLength(2)
    expect(warnings.queryByTestId("violations-blocking")).not.toBeInTheDocument()
    expect(warnings.queryByRole("link")).not.toBeInTheDocument()
  })

  it("renders the ViolationList blocking and mixed states, blocking first and linked", () => {
    renderGallery()

    const blocking = within(screen.getByTestId("violations-state-blocking"))
    const group = blocking.getByTestId("violations-blocking")
    expect(group).toHaveTextContent("Needs attention (1)")
    expect(group.querySelector("h3")!.className).toContain("text-destructive")
    expect(blocking.getByRole("link", { name: "View 2 appointments" })).toHaveAttribute(
      "href",
      "/app/timeline?d=2026-08-03&b=f0000000-0000-4000-8000-000000000900"
    )
    expect(blocking.queryByTestId("violations-warnings")).not.toBeInTheDocument()

    const mixed = within(screen.getByTestId("violations-state-mixed"))
    const mixedBlocking = mixed.getByTestId("violations-blocking")
    const mixedWarnings = mixed.getByTestId("violations-warnings")
    expect(mixedBlocking).toHaveTextContent("Needs attention (1)")
    expect(mixedWarnings).toHaveTextContent("Worth checking (2)")
    expect(
      mixedBlocking.compareDocumentPosition(mixedWarnings) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it("shows the shell's own offline banner rather than a copy that could drift", () => {
    renderGallery()
    expect(screen.getByTestId("offline-banner")).toHaveTextContent(OFFLINE_MESSAGE)
  })

  it("shows the shared form primitives at one control scale", () => {
    renderGallery()
    const forms = within(screen.getByTestId("form-primitives"))

    for (const control of [forms.getByLabelText("Label"), forms.getByLabelText("Chair")]) {
      expect(control).toHaveClass("h-11")
      expect(control).toHaveClass("sm:h-10")
    }

    const invalid = forms.getByLabelText("Mobile number")
    expect(invalid).toHaveAttribute("aria-invalid", "true")
    expect(invalid).toHaveAccessibleDescription(PHONE_ERROR)
    expect(forms.getByLabelText("Checkbox")).toBeChecked()
  })

  it("shows every shared component, so the page cannot quietly fall behind the kit", () => {
    const kit = import.meta.glob("../components/{ui,shell}/*.tsx")
    const shared = Object.keys(kit)
      .map((path) => path.split("/").pop()!.replace(".tsx", ""))
      .filter((name) => !name.endsWith(".test") && !EXEMPT_FROM_GALLERY.has(name))

    const source = Object.values(
      import.meta.glob("./dev-ui-page.tsx", { query: "?raw", import: "default", eager: true })
    )[0] as string
    const missing = shared.filter((name) => !source.includes(`/${name}"`))

    expect(missing).toEqual([])
  })

  it("shows the shell chrome with its current-destination treatment visible", () => {
    renderGallery()
    const header = within(screen.getByTestId("shell-workspace-header"))
    const shell = within(screen.getByTestId("shell-gallery"))

    expect(header.getByRole("button", { name: /Account: Anong Prasert/ })).toBeInTheDocument()
    expect(header.getByRole("button", { name: /Theme:/ })).toBeInTheDocument()
    expect(shell.getAllByRole("link", { name: "Gallery" })[0]).toHaveClass("bg-primary-surface")
  })

  it("swatches every colour token, including the pairs the contrast gate checks", () => {
    renderGallery()

    for (const token of ["primary-surface", "primary-on-surface", "selection", "timeline-offshift"]) {
      expect(screen.getByTestId(`token-${token}`)).toBeInTheDocument()
    }
    expect(within(screen.getByTestId("token-pairs")).getAllByText(/ on /)).toHaveLength(16)
  })

  it("scopes its coverage claim to what it can actually see", () => {
    renderGallery()
    expect(screen.getByRole("heading", { name: "Coverage" })).toBeInTheDocument()
    expect(screen.getByText(/It does not show whole screens/)).toBeInTheDocument()
  })

  it("demonstrates the shared careful joy context primitives", () => {
    renderGallery()
    expect(screen.getByRole("heading", { name: "Clinic settings" })).toBeInTheDocument()
    expect(screen.getByText("Needs attention").closest('[role="status"]')).toHaveTextContent(
      "Needs attention"
    )
    const dentistName = screen.getByText("Dr. Anong Srisuk")
    expect(dentistName.previousElementSibling).toHaveTextContent("DA")
    expect(dentistName.previousElementSibling).toHaveAttribute("aria-hidden", "true")
  })

  it("demonstrates the AlertDialog primitive behind every deactivate confirmation", async () => {
    renderGallery()
    const user = userEvent.setup()

    expect(screen.queryByText("Deactivate branch?")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Deactivate branch" }))

    expect(screen.getByText("Deactivate branch?")).toBeInTheDocument()
    const buttons = screen.getAllByRole("button").map((button) => button.textContent)
    expect(buttons.indexOf("Keep branch")).toBeLessThan(buttons.indexOf("Deactivate"))
  })
})
