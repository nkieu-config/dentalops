import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"
import { ConfirmedStep } from "./confirmed-step"

const booking = {
  appointment: {
    id: "1f9619ff-8b86-4d01-b42d-00cf4fc964ff",
    status: "confirmed" as const,
    startsAt: "2026-08-03T03:30:00.000Z",
    endsAt: "2026-08-03T04:15:00.000Z",
    clinic: { id: "2f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Bright Smile", slug: "bright-smile" },
    branch: { id: "3f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Sukhumvit" },
    service: { id: "4f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Cleaning", durationMin: 45 },
    dentist: { id: "5f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Dr. Anong" },
    patient: { id: "6f9619ff-8b86-4d01-b42d-00cf4fc964ff", name: "Napat" }
  },
  manageToken: "header.payload.signature"
}

describe("ConfirmedStep", () => {
  it("does not claim a manage link was copied when clipboard writing fails", async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Unavailable")) }
    })
    render(
      <MemoryRouter>
        <ConfirmedStep booking={booking} clinicName="Bright Smile" emailProvided />
      </MemoryRouter>
    )

    await user.click(screen.getByRole("button", { name: "Copy manage link" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not copy the manage link")
    expect(screen.getByRole("button", { name: "Copy manage link" })).toBeVisible()
  })
})
