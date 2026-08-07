import type { Violation } from "@dentalops/contracts"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"
import { ViolationList, type ViolationLink } from "./violation-list"

const anongId = "2f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const nidId = "3f9619ff-8b86-4d01-b42d-00cf4fc964ff"
const apptId = "a1000000-0000-4000-8000-000000000021"

const names: Record<string, string> = { [anongId]: "Dr. Anong", [nidId]: "Dr. Nid" }
const staffName = (id: string) => names[id] ?? "Unknown staff"

const blocking: Violation = {
  rule: "appointment_outside_shift",
  severity: "block",
  staffId: anongId,
  detail: "2 confirmed appointments fall outside the rostered shifts",
  appointmentIds: [apptId, "a1000000-0000-4000-8000-000000000022"]
}

const warning: Violation = {
  rule: "insufficient_rest",
  severity: "warn",
  staffId: nidId,
  detail: "540 minutes of rest before the next shift, under the 660 minute minimum"
}

const linkFor = (violation: Violation): ViolationLink | null =>
  violation.appointmentIds
    ? { href: "/app/timeline?d=2026-08-03&b=branch-1", label: "View 2 appointments" }
    : null

const mount = (violations: Violation[], link?: typeof linkFor) =>
  render(
    <MemoryRouter>
      <ViolationList violations={violations} staffName={staffName} linkFor={link} />
    </MemoryRouter>
  )

describe("ViolationList", () => {
  it("renders a clean state with an icon and words, not colour alone", () => {
    mount([])
    expect(screen.getByTestId("violations-clean")).toHaveTextContent("No violations")
    expect(screen.getByTestId("violations-clean").querySelector("svg")).toBeInTheDocument()
    expect(screen.queryByTestId("violations-blocking")).not.toBeInTheDocument()
    expect(screen.queryByTestId("violations-warnings")).not.toBeInTheDocument()
  })

  it("renders warnings only with the warning token and an icon", () => {
    mount([warning])
    const group = screen.getByTestId("violations-warnings")
    expect(group).toHaveTextContent("Worth checking (1)")
    expect(group.querySelector("h3")!.className).toContain("text-warning")
    expect(screen.getAllByLabelText("Worth checking").length).toBe(1)
    expect(group).toHaveTextContent("Dr. Nid")
    expect(group).toHaveTextContent("540 minutes of rest")
    expect(screen.queryByTestId("violations-blocking")).not.toBeInTheDocument()
    expect(screen.queryByTestId("violations-clean")).not.toBeInTheDocument()
  })

  it("renders blocking violations with the destructive token, an icon and a timeline link", () => {
    mount([blocking], linkFor)
    const group = screen.getByTestId("violations-blocking")
    expect(group).toHaveTextContent("Needs attention (1)")
    expect(group.querySelector("h3")!.className).toContain("text-destructive")
    expect(screen.getAllByLabelText("Needs attention").length).toBe(1)
    expect(group).toHaveTextContent("Dr. Anong")
    expect(group).toHaveTextContent("2 confirmed appointments fall outside")

    const link = screen.getByRole("link", { name: "View 2 appointments" })
    expect(link).toHaveAttribute("href", "/app/timeline?d=2026-08-03&b=branch-1")
  })

  it("lists blocking before warnings when both are present and counts each group", () => {
    mount([blocking, warning, { ...warning, staffId: anongId, rule: "weekly_hours_exceeded" }])
    const blockingGroup = screen.getByTestId("violations-blocking")
    const warningGroup = screen.getByTestId("violations-warnings")
    expect(blockingGroup).toHaveTextContent("Needs attention (1)")
    expect(warningGroup).toHaveTextContent("Worth checking (2)")
    expect(
      blockingGroup.compareDocumentPosition(warningGroup) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(screen.queryByTestId("violations-clean")).not.toBeInTheDocument()
  })

  it("omits the link when a violation names no appointments", () => {
    mount([warning], linkFor)
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })
})
